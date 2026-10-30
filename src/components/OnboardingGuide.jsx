import { FolderOpen, GraduationCap, Wrench } from 'lucide-react'
import { FindingFiles } from './FindingFiles.jsx'

export function OnboardingGuide({ onboarding, effort }) {
  if (!onboarding) return null
  const prerequisites = onboarding.prerequisites || []
  const steps = onboarding.steps || []
  const keyFiles = onboarding.keyFiles || []
  if (!prerequisites.length && !steps.length && !keyFiles.length) return null

  return (
    <section className="card">
      <div className="card__header">
        <div className="card__title">
          <GraduationCap size={15} aria-hidden="true" />
          Onboarding guide
        </div>
        {effort ? <span className="badge badge--muted">Effort: {effort}</span> : null}
      </div>
      <div className="card__body">
        {prerequisites.length ? (
          <div className="onboarding-block">
            <h4 className="onboarding-block__title">
              <Wrench size={13} aria-hidden="true" />
              Prerequisites
            </h4>
            <div className="row-wrap" style={{ gap: 6 }}>
              {prerequisites.map((entry) => (
                <span className="chip" key={entry}>
                  {entry}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {steps.length ? (
          <div className="onboarding-block">
            <h4 className="onboarding-block__title">Setup steps</h4>
            <div className="onboarding-steps">
              {steps.map((step, index) => (
                <div className="onboarding-step" key={`${step.title}-${index}`}>
                  <span className="rec-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="rec-body">
                    <h4>{step.title}</h4>
                    <p>{step.detail}</p>
                    <FindingFiles files={step.files} label="Files for this step" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {keyFiles.length ? (
          <div className="onboarding-block">
            <h4 className="onboarding-block__title">
              <FolderOpen size={13} aria-hidden="true" />
              Key files to read first
            </h4>
            <FindingFiles files={keyFiles} label="Key files" />
          </div>
        ) : null}
      </div>
    </section>
  )
}
