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
        break
      case 'assignTask':
        result = updateTaskFields(body.taskId, { assignee_id: body.assigneeId || '' })
        break
      case 'updatePriority':
        result = updateTaskFields(body.taskId, { priority: body.priority })
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
          return ''
        case 'creator_id':
          return t.creatorId || ''
        case 'created_at':
          return today
        case 'due_date':
          return t.deadline || ''
        case 'visibility':
          return '全員'
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
        default:
          return ''
      }
    })
    sheet.appendRow(row)
    created.push({ tempId: t.tempId, id: id })
  })

  return created
}

function updateTaskFields(taskId, fields) {
  return updateRowFields(SHEET_TASKS, taskId, fields)
}

// ---- Members ----------------------------------------------------------------

function updateMemberFields(memberId, fields) {
  return updateRowFields(SHEET_MEMBERS, memberId, fields)
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
