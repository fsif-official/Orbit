/**
 * Orbit — Apps Script Web App (write API for the spreadsheet "database").
 *
 * Setup: open the FSIF database spreadsheet -> Extensions > Apps Script,
 * paste this whole file in as Code.gs, then Deploy > New deployment ->
 * type "Web app", execute as "Me", who has access "Anyone". Copy the
 * resulting /exec URL into the CSV_GAS GitHub secret.
 *
 * Reads (Members/Projects/Tasks) go directly to each sheet's published-CSV
 * URL from the frontend; this script only handles writes, dispatched by an
 * `action` field in the POST body. See gas/README.md for the full sheet
 * schema this expects.
 */

var SHEET_MEMBERS = 'Members'
var SHEET_PROJECTS = 'Projects'
var SHEET_TASKS = 'Tasks'

// A member is completing a certain number of same-category tasks and
// auto-certifying isn't something this file does — that check runs
// client-side (lib/orbit/store.tsx) since it only needs data already in
// hand. This file only handles writes coming from the browser.

function doGet(e) {
  return ContentService.createTextOutput('Orbit GAS endpoint is up.').setMimeType(
    ContentService.MimeType.TEXT,
  )
}

function doPost(e) {
  var result
  try {
    var body = JSON.parse(e.postData.contents)
    switch (body.action) {
      case 'createTasks':
        result = createTasks(body.tasks)
        break
      case 'updateTaskStatus':
        result = updateTaskFields(body.taskId, {
          status: body.status,
          last_activity: todayStr(),
          completed_date: body.status === '完了' ? todayStr() : '',
        })
        // the assignee's "I'm done" signal — email the admins so they know
        // to go confirm it (they already see it in their 確認待ち panel)
        if (body.status === '確認待ち') notifyReview(body.taskId)
        break
      case 'assignTask':
        result = updateTaskFields(body.taskId, {
          assignee_id: (body.assigneeIds || []).join(','),
        })
        syncCalendarForTask(body.taskId)
        break
      case 'updatePriority':
        result = updateTaskFields(body.taskId, { priority: body.priority })
        break
      case 'updateDifficulty':
        result = updateTaskFields(body.taskId, { difficulty: body.difficulty })
        break
      case 'updateProgress':
        result = updateTaskFields(body.taskId, {
          progress_note: body.text,
          last_activity: todayStr(),
        })
        break
      case 'updateWill':
        result = updateMemberFields(body.memberId, { will_tags: (body.will || []).join(',') })
        break
      case 'updateJudgment':
        result = updateMemberFields(body.memberId, {
          judgment_tags: (body.judgment || []).join(','),
        })
        break
      case 'approveTask':
        result = updateTaskFields(body.taskId, { approval_status: '承認済み' })
        break
      case 'createProject':
        result = createProject(body.name, body.description, body.type)
        break
      case 'removeMember':
        result = removeMember(body.memberId)
        break
      case 'updateNotify':
        result = updateMemberFields(body.memberId, {
          notify_new_task: body.notify ? 'TRUE' : 'FALSE',
        })
        break
      case 'updateRole':
        result = updateMemberFields(body.memberId, { role: body.role })
        break
      case 'updateReportsTo':
        result = updateMemberFields(body.memberId, { reports_to_id: body.reportsToId || '' })
        break
      case 'updateDisplayName':
        result = updateMemberFields(body.memberId, { display_name: body.displayName || '' })
        break
      case 'updateUnavailableDates':
        result = updateMemberFields(body.memberId, {
          unavailable_dates: (body.dates || []).join(','),
        })
        break
      case 'updateSchedule':
        result = updateTaskFields(body.taskId, {
          start_date: body.startDate || '',
          due_date: body.deadline || '',
        })
        notifyScheduleChange(body.taskId)
        break
      case 'updateDependsOn':
        result = updateTaskFields(body.taskId, {
          depends_on_ids: (body.dependsOnIds || []).join(','),
        })
        break
      case 'updateVisibility':
        result = updateTaskFields(body.taskId, {
          visibility: body.visibility === '幹部' ? '幹部' : '全員',
        })
        break
      case 'updateAvatar':
        // choosing a color+initials avatar supersedes any uploaded picture
        result = updateMemberFields(body.memberId, {
          avatar_color: body.avatarColor || '',
          avatar_initials: body.initials || '',
          avatar_url: '',
        })
        break
      case 'uploadAvatar':
        result = uploadAvatar(body.memberId, body.dataUrl, body.filename, body.folderId)
        break
      case 'addMember':
        result = addMember(body.name, body.email, body.affiliation, body.role)
        break
      case 'updateEmail':
        result = updateMemberFields(body.memberId, { email: body.email || '' })
        break
      default:
        throw new Error('Unknown action: ' + body.action)
    }
    return jsonOutput({ ok: true, result: result })
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) })
  }
}

// ---- Tasks ----------------------------------------------------------------

// New rows are built by walking the sheet's actual header row (see
// gas/README.md for the full column list), so this works regardless of
// column order and leaves any column not listed below blank.
function createTasks(tasks) {
  var sheet = getSheet(SHEET_TASKS)
  var headers = headerRow(sheet)
  var nextId = nextIntId(sheet, headers)
  var today = todayStr()
  var created = []

  tasks.forEach(function (t) {
    var id = String(nextId++)
    var row = headers.map(function (h) {
      switch (h) {
        case 'id':
          return id
        case 'project_id':
          return t.projectId
        case 'title':
          return t.title
        case 'description':
          return t.description || ''
        case 'status':
          return '未着手'
        case 'assign_type':
          return 'open_bid'
        case 'assignee_id':
          return (t.assigneeIds || []).join(',')
        case 'creator_id':
          return t.creatorId || ''
        case 'created_at':
          return today
        case 'start_date':
          return t.startDate || ''
        case 'due_date':
          return t.deadline || ''
        case 'due_time':
          return t.dueTime || ''
        case 'visibility':
          return t.visibility === '幹部' ? '幹部' : '全員'
        case 'department':
          return t.department || ''
        case 'category':
          return t.category || ''
        case 'skills':
          return (t.skills || []).join(',')
        case 'difficulty':
          return t.difficulty || ''
        case 'priority':
          return t.priority || ''
        case 'last_activity':
          return today
        case 'original_input_id':
          return t.originalInputId || ''
        case 'approval_status':
          return t.pendingApproval === false ? '承認済み' : '承認待ち'
        default:
          return ''
      }
    })
    sheet.appendRow(row)
    created.push({ tempId: t.tempId, id: id })
    if (t.assigneeIds && t.assigneeIds.length > 0) syncCalendarForTask(id)
  })

  // template tasks (pendingApproval === false) don't need an approval-queue email
  var needsApproval = tasks.filter(function (t) {
    return t.pendingApproval !== false
  })
  if (needsApproval.length > 0) notifyNewTasks(needsApproval)
  return created
}

function updateTaskFields(taskId, fields) {
  return updateRowFields(SHEET_TASKS, taskId, fields)
}

// Emails whoever is flagged notify_new_task=TRUE on Members, falling back
// to every 代表 if nobody opted in (a notification must always go out
// somewhere). Best-effort: a mail failure never fails task creation.
function notifyNewTasks(tasks) {
  var titles = tasks.map(function (t) {
    return '・' + t.title
  })
  notifyAdmins(
    '[Orbit] 新しいタスクが承認待ちです（' + tasks.length + '件）',
    '以下のタスクが登録され、承認待ちです。\n\n' +
      titles.join('\n') +
      '\n\nOrbitの管理画面 > 承認 から確認してください。',
  )
}

// Emails admins when an assignee marks a task 確認待ち (their "I'm done,
// please confirm" signal).
function notifyReview(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    notifyAdmins(
      '[Orbit] タスクの確認をお願いします',
      '「' + task.title + '」が確認待ちになりました。\n\nOrbitで確認し、問題なければ「完了」にしてください。',
      reportsToEmails(assigneeIds),
    )
  } catch (err) {
    // best-effort
  }
}

// Shared recipient logic: notify_new_task=TRUE members, or every 代表 if
// nobody opted in. Best-effort — a mail failure is swallowed. When
// `preferredEmails` is given (item 9's "admin of admins" hierarchy — e.g. a
// task's assignee's reports_to_id) those are used instead, still falling
// back to the default set if none resolve to anything.
function notifyAdmins(subject, body, preferredEmails) {
  try {
    if (preferredEmails && preferredEmails.length > 0) {
      MailApp.sendEmail({ to: preferredEmails.join(','), subject: subject, body: body })
      return
    }
    var sheet = getSheet(SHEET_MEMBERS)
    var headers = headerRow(sheet)
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()
    var emailCol = headers.indexOf('email')
    var notifyCol = headers.indexOf('notify_new_task')
    var roleCol = headers.indexOf('role')
    if (emailCol === -1) return // no email column configured yet

    var opted = []
    var reps = []
    rows.forEach(function (r) {
      var email = String(r[emailCol] || '').trim()
      if (!email) return
      var notify = notifyCol !== -1 && /^(true|1|yes)$/i.test(String(r[notifyCol] || ''))
      if (notify) opted.push(email)
      else if (roleCol !== -1 && r[roleCol] === '代表') reps.push(email)
    })
    var recipients = opted.length > 0 ? opted : reps
    if (recipients.length === 0) return

    MailApp.sendEmail({ to: recipients.join(','), subject: subject, body: body })
  } catch (err) {
    // swallow — a mail error shouldn't roll back the caller's action
  }
}

// Resolves the "admin of admins" recipients for a set of assignee member
// ids: each assignee's reports_to_id (if set) mapped to that member's
// email. Returns [] when nobody involved has a reports_to_id set, so
// callers fall back to notifyAdmins' default opted-in/代表 logic.
function reportsToEmails(assigneeIds) {
  try {
    var sheet = getSheet(SHEET_MEMBERS)
    var headers = headerRow(sheet)
    var idCol = headers.indexOf('id')
    var emailCol = headers.indexOf('email')
    var reportsToCol = headers.indexOf('reports_to_id')
    if (idCol === -1 || emailCol === -1 || reportsToCol === -1) return []
    var rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues()

    var byId = {}
    rows.forEach(function (r) {
      byId[String(r[idCol])] = { email: String(r[emailCol] || '').trim(), reportsTo: String(r[reportsToCol] || '').trim() }
    })

    var emails = []
    ;(assigneeIds || []).forEach(function (aid) {
      var m = byId[String(aid)]
      var managerId = m && m.reportsTo
      var manager = managerId && byId[managerId]
      if (manager && manager.email && emails.indexOf(manager.email) === -1) {
        emails.push(manager.email)
      }
    })
    return emails
  } catch (err) {
    return []
  }
}

// Emails admins (routed via reportsToEmails when the task's assignees have
// a designated 報告先) when a task's start date / deadline changes from
// the detail drawer.
function notifyScheduleChange(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task) return
    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    notifyAdmins(
      '[Orbit] タスクの日程が変更されました',
      '「' + task.title + '」の日程が変更されました。\n開始日: ' +
        (task.start_date || '未設定') +
        '\n期限: ' +
        (task.due_date || '未設定') +
        '\n\nOrbitで確認してください。',
      reportsToEmails(assigneeIds),
    )
  } catch (err) {
    // best-effort
  }
}

// Creates/updates a Google Calendar event (on this script's default
// calendar) for a task's assignees, inviting them by email if known.
// Best-effort — never throws back to the caller.
function syncCalendarForTask(taskId) {
  try {
    var task = findRow(SHEET_TASKS, taskId)
    if (!task || !task.due_date) return

    var assigneeIds = String(task.assignee_id || '')
      .split(',')
      .map(function (s) {
        return s.trim()
      })
      .filter(Boolean)
    if (assigneeIds.length === 0) return

    var members = getSheet(SHEET_MEMBERS)
    var mHeaders = headerRow(members)
    var idCol = mHeaders.indexOf('id')
    var emailCol = mHeaders.indexOf('email')
    if (idCol === -1 || emailCol === -1) return
    var mRows = members.getRange(2, 1, Math.max(members.getLastRow() - 1, 0), mHeaders.length).getValues()
    var guests = mRows
      .filter(function (r) {
        return assigneeIds.indexOf(String(r[idCol])) !== -1
      })
      .map(function (r) {
        return String(r[emailCol] || '').trim()
      })
      .filter(Boolean)
    if (guests.length === 0) return

    var cal = CalendarApp.getDefaultCalendar()
    var title = '[Orbit] ' + task.title
    var existing = cal.getEvents(
      new Date(task.due_date + 'T00:00:00'),
      new Date(task.due_date + 'T23:59:59'),
      { search: title },
    )
    existing.forEach(function (ev) {
      ev.deleteEvent()
    })

    if (task.due_time) {
      var start = new Date(task.due_date + 'T' + task.due_time + ':00')
      var end = new Date(start.getTime() + 60 * 60 * 1000)
      cal.createEvent(title, start, end, { guests: guests.join(','), sendInvites: true })
    } else {
      cal.createAllDayEvent(title, new Date(task.due_date + 'T00:00:00'), {
        guests: guests.join(','),
        sendInvites: true,
      })
    }
  } catch (err) {
    // best-effort — Calendar quota/permissions issues shouldn't break assignment
  }
}

// ---- Projects ---------------------------------------------------------------

function createProject(name, description, type) {
  var sheet = getSheet(SHEET_PROJECTS)
  var headers = headerRow(sheet)
  var id = String(nextIntId(sheet, headers))
  var row = headers.map(function (h) {
    if (h === 'id') return id
    if (h === 'name') return name
    if (h === 'description') return description || ''
    if (h === 'type') return type || ''
    return ''
  })
  sheet.appendRow(row)
  return { id: id }
}

// ---- Members ----------------------------------------------------------------

function updateMemberFields(memberId, fields) {
  return updateRowFields(SHEET_MEMBERS, memberId, fields)
}

// Adds a brand-new member row — used by Admin → Members "メンバーを登録",
// including registering someone directly as an admin (role != 一般).
function addMember(name, email, affiliation, role) {
  var sheet = getSheet(SHEET_MEMBERS)
  var headers = headerRow(sheet)
  var id = String(nextIntId(sheet, headers))
  var row = headers.map(function (h) {
    switch (h) {
      case 'id':
        return id
      case 'name':
        return name
      case 'email':
        return email || ''
      case 'role':
        return role || '一般'
      case 'notify_new_task':
        return 'FALSE'
      default:
        return ''
    }
  })
  sheet.appendRow(row)
  // affiliation isn't its own column — it's derived from project_ids (or,
  // for admin roles with none, defaulted client-side), so nothing to store
  // for it here; kept as a param for parity with the client-side call.
  return { id: id }
}

// Saves a profile picture (sent as a data: URL, already resized client-side)
// into the configured Drive folder, makes it link-viewable so it can be
// hotlinked from an <img> tag, replaces any previous upload for this
// member, and records the resulting URL on their Members row.
function uploadAvatar(memberId, dataUrl, filename, folderId) {
  if (!folderId) throw new Error('Drive folder is not configured (NEXT_PUBLIC_DRIVE_FOLDER_ID)')
  var match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/)
  if (!match) throw new Error('Expected a base64 data URL')
  var mimeType = match[1]
  var base64Data = match[2]

  var folder = DriveApp.getFolderById(folderId)
  var namePrefix = 'avatar_' + memberId + '_'

  // remove any previous upload for this member so the folder doesn't
  // accumulate orphaned files every time someone changes their picture
  var existing = folder.getFiles()
  while (existing.hasNext()) {
    var f = existing.next()
    if (f.getName().indexOf(namePrefix) === 0) f.setTrashed(true)
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename)
  var file = folder.createFile(blob)
  file.setName(namePrefix + Date.now())
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

  // a thumbnail URL hotlinks reliably in <img> tags (unlike Drive's
  // "uc?export=view" links, which can trigger a virus-scan interstitial)
  var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w256'
  updateMemberFields(memberId, { avatar_url: url })
  return { url: url }
}

// Deletes the member's row and clears assignee_id (or removes just their
// id from a multi-assignee list) on every task assigned to them.
function removeMember(memberId) {
  var members = getSheet(SHEET_MEMBERS)
  var memberHeaders = headerRow(members)
  var idCol = memberHeaders.indexOf('id') + 1
  var lastRow = members.getLastRow()
  var ids = idCol > 0 ? members.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues() : []
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(memberId)) {
      members.deleteRow(i + 2)
      break
    }
  }

  var tasks = getSheet(SHEET_TASKS)
  var taskHeaders = headerRow(tasks)
  var assigneeCol = taskHeaders.indexOf('assignee_id') + 1
  if (assigneeCol > 0) {
    var taskLastRow = tasks.getLastRow()
    var assignees = tasks.getRange(2, assigneeCol, Math.max(taskLastRow - 1, 0), 1).getValues()
    for (var j = 0; j < assignees.length; j++) {
      var remaining = String(assignees[j][0] || '')
        .split(',')
        .map(function (s) {
          return s.trim()
        })
        .filter(function (id) {
          return id && id !== String(memberId)
        })
      if (remaining.length !== String(assignees[j][0] || '').split(',').filter(Boolean).length) {
        tasks.getRange(j + 2, assigneeCol).setValue(remaining.join(','))
      }
    }
  }

  return { removed: memberId }
}

// ---- shared row helpers -----------------------------------------------------

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
  if (!sheet) throw new Error('Sheet not found: ' + name)
  return sheet
}

function headerRow(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) {
      return String(h).trim()
    })
}

function nextIntId(sheet, headers) {
  var idCol = headers.indexOf('id') + 1
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return 1
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues()
  var max = 0
  ids.forEach(function (r) {
    var n = parseInt(r[0], 10)
    if (!isNaN(n) && n > max) max = n
  })
  return max + 1
}

// Reads a whole row (by its "id" column) into a {headerName: value} object.
function findRow(sheetName, rowId) {
  var sheet = getSheet(sheetName)
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id')
  if (idCol === -1) throw new Error('No "id" column on ' + sheetName)

  var lastRow = sheet.getLastRow()
  var values = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), headers.length).getValues()
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol]) === String(rowId)) {
      var obj = {}
      headers.forEach(function (h, c) {
        obj[h] = values[i][c]
      })
      return obj
    }
  }
  return null
}

// Finds the row whose "id" column equals rowId, and writes `fields`
// (a {headerName: value} map) into the matching columns of that row.
function updateRowFields(sheetName, rowId, fields) {
  var sheet = getSheet(sheetName)
  var headers = headerRow(sheet)
  var idCol = headers.indexOf('id') + 1
  if (idCol === 0) throw new Error('No "id" column on ' + sheetName)

  var lastRow = sheet.getLastRow()
  var ids = sheet.getRange(2, idCol, Math.max(lastRow - 1, 0), 1).getValues()
  var targetRow = -1
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(rowId)) {
      targetRow = i + 2
      break
    }
  }
  if (targetRow === -1) throw new Error(sheetName + ' row not found for id ' + rowId)

  Object.keys(fields).forEach(function (key) {
    var col = headers.indexOf(key) + 1
    if (col === 0) return // unknown column on this sheet — skip silently
    sheet.getRange(targetRow, col).setValue(fields[key])
  })

  return { id: rowId, updated: Object.keys(fields) }
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
