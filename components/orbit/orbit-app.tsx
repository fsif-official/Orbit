'use client'

import { OrbitProvider, useOrbit } from '@/lib/orbit/store'
import { NavProvider, useNav } from '@/lib/orbit/nav'
import { ThemeProvider } from '@/lib/orbit/theme'
import { ToastProvider } from './toast'
import { LoginScreen } from './login-screen'
import { Header } from './header'
import { InputScreen } from './input/input-screen'
import { OutputScreen } from './output/output-screen'
import { PersonDetail } from './people/person-detail'
import { ProjectDetail } from './projects/project-detail'
import { AdminScreen } from './admin/admin-screen'

function Router() {
  const { currentUser } = useOrbit()
  const { screen } = useNav()

  if (!currentUser) return <LoginScreen />

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div key={JSON.stringify(screen)} className="animate-in fade-in duration-200">
        {screen.name === 'input' && <InputScreen />}
        {screen.name === 'output' && <OutputScreen />}
        {screen.name === 'person' && <PersonDetail id={screen.id} />}
        {screen.name === 'project' && <ProjectDetail id={screen.id} />}
        {screen.name === 'admin' && <AdminScreen section={screen.section} />}
      </div>
    </div>
  )
}

export function OrbitApp() {
  return (
    <ThemeProvider>
      <OrbitProvider>
        <ToastProvider>
          <NavProvider>
            <Router />
          </NavProvider>
        </ToastProvider>
      </OrbitProvider>
    </ThemeProvider>
  )
}
