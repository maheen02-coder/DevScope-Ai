import { Boxes, FileCode2 } from 'lucide-react'

export function ArchitectureMap({ layers }) {
  if (!layers?.length) return null
  return (
    <section className="card">
      <div className="card__header">
        <div className="card__title">
          <Boxes size={15} aria-hidden="true" />
          Architecture map
        </div>
        <span className="hint">{layers.length} layers · inferred by the model</span>
      </div>
      <div className="card__body">
        <div className="arch-map">
          {layers.map((layer, index) => (
            <div className="arch-layer" key={`${layer.name}-${index}`}>
              <span className="arch-layer__marker" aria-hidden="true">
                {index + 1}
              </span>
              <div className="arch-layer__body">
                <h4>{layer.name}</h4>
                <p>{layer.responsibility}</p>
                {layer.components?.length ? (
                  <div className="finding-files">
                    {layer.components.map((component) => (
                      <span className="file-pill" key={component} title={component}>
                        <FileCode2 size={11} aria-hidden="true" />
                        <span>{component}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
