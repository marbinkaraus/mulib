import { useCallback, useMemo, useState, type ReactNode } from 'react'

export type WizardStepId = 'source' | 'options' | 'review' | 'progress'

export interface WizardStep {
  id: WizardStepId
  title: string
  hint?: string
  content: ReactNode
}

export function Wizard(props: {
  steps: WizardStep[]
  initialStepId?: WizardStepId
  footer?: ReactNode
}) {
  const { steps, initialStepId = steps[0]?.id, footer } = props

  const initialIndex = useMemo(() => {
    const idx = steps.findIndex((s) => s.id === initialStepId)
    return idx >= 0 ? idx : 0
  }, [steps, initialStepId])

  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const active = steps[activeIndex]

  const goTo = useCallback(
    (id: WizardStepId) => {
      const idx = steps.findIndex((s) => s.id === id)
      if (idx < 0) return
      setActiveIndex(idx)
    },
    [steps]
  )

  const goBack = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex((i) => Math.min(steps.length - 1, i + 1))
  }, [steps.length])

  return (
    <section className='wizard'>
      <ol className='wizardStepper'>
        {steps.map((s, idx) => {
          const isActive = idx === activeIndex
          const state = isActive ? 'active' : idx < activeIndex ? 'complete' : 'idle'
          return (
            <li key={s.id} className='wizardStep' data-state={state}>
              <button type='button' className='wizardStepButton' onClick={() => goTo(s.id)}>
                <span className='wizardStepIndex'>{idx + 1}</span>
                <span className='wizardStepText'>
                  <span className='wizardStepLabel'>{s.title}</span>
                  {s.hint ? <span className='wizardStepHint'>{s.hint}</span> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className='wizardPanel card'>
        <header className='cardHeader wizardPanelHeader'>
          <h2 className='cardTitle'>{active?.title}</h2>
          <div className='wizardPanelNav'>
            <button type='button' onClick={goBack} disabled={activeIndex === 0}>
              Back
            </button>
            <button type='button' onClick={goNext} disabled={activeIndex >= steps.length - 1}>
              Next
            </button>
          </div>
        </header>

        <div className='cardBody'>{active?.content}</div>
        {footer ? <div className='wizardFooter'>{footer}</div> : null}
      </div>
    </section>
  )
}
