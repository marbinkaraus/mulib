import type { ReactNode } from 'react'

export function AppShell(props: {
  title: string
  subtitle?: string
  rail?: ReactNode
  children: ReactNode
}) {
  const { title, subtitle, rail, children } = props

  return (
    <div className='appShell'>
      <header className='appShellHeader'>
        <div className='appShellTitle'>
          <h1 className='appShellH1'>{title}</h1>
          {subtitle ? <p className='appShellSubtitle'>{subtitle}</p> : null}
        </div>
      </header>

      <div className='appShellBody'>
        <div className='appShellMain'>{children}</div>
        {rail ? <aside className='appShellRail'>{rail}</aside> : null}
      </div>
    </div>
  )
}
