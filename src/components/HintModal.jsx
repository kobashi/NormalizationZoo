import React from 'react';

function FieldPill({ children, accent = false }) {
  return <span className={`diagram-pill ${accent ? 'accent' : ''}`}>{children}</span>;
}

function VectorDiagram({ section }) {
  return (
    <div className="diagram-stack">
      {section.fields.map((field) => (
        <div key={field.name} className="vector-row">
          <FieldPill accent>{field.name}</FieldPill>
          <span className="diagram-arrow">=</span>
          <FieldPill>{field.sample}</FieldPill>
        </div>
      ))}
    </div>
  );
}

function PartialDiagram({ section }) {
  return (
    <div className="diagram-stack">
      <div className="dependency-row">
        <div className="field-group">
          {section.keyFields.map((field) => (
            <FieldPill key={field} accent>
              {field}
            </FieldPill>
          ))}
        </div>
        <span className="diagram-caption">複合キー</span>
      </div>
      <div className="dependency-row">
        <div className="field-group">
          {section.determinantFields.map((field) => (
            <FieldPill key={field} accent>
              {field}
            </FieldPill>
          ))}
        </div>
        <span className="diagram-arrow">→</span>
        <div className="field-group">
          {section.dependentFields.map((field) => (
            <FieldPill key={field}>{field}</FieldPill>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransitiveDiagram({ section }) {
  return (
    <div className="diagram-stack">
      <div className="dependency-row">
        <FieldPill accent>{section.startField}</FieldPill>
        <span className="diagram-arrow">→</span>
        <FieldPill accent>{section.middleField}</FieldPill>
        <span className="diagram-arrow">→</span>
        <FieldPill>{section.endField}</FieldPill>
      </div>
      <div className="dependency-row">
        <FieldPill accent>{section.startField}</FieldPill>
        <span className="diagram-arrow muted">↛</span>
        <FieldPill>{section.endField}</FieldPill>
        <span className="diagram-caption">本来は別表に分けたい</span>
      </div>
    </div>
  );
}

function ResolvedDiagram({ section }) {
  return (
    <div className="resolved-grid">
      {section.groups.map((group) => (
        <div key={group.title} className="resolved-card">
          <strong>{group.title}</strong>
          <div className="field-group">
            {group.fields.map((field) => (
              <FieldPill key={field}>{field}</FieldPill>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HintDiagram({ section }) {
  if (section.kind === 'vector') {
    return <VectorDiagram section={section} />;
  }
  if (section.kind === 'partial') {
    return <PartialDiagram section={section} />;
  }
  if (section.kind === 'transitive') {
    return <TransitiveDiagram section={section} />;
  }
  return <ResolvedDiagram section={section} />;
}

function HintModal({ stage, isOpen, onClose }) {
  if (!isOpen || !stage?.hint) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hint-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">構造のヒント</p>
            <h3 id="hint-modal-title">{stage.hint.title}</h3>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="hint-sections">
          {stage.hint.sections.map((section) => (
            <section key={section.label} className="hint-section">
              <h4>{section.label}</h4>
              <p>{section.description}</p>
              <HintDiagram section={section} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HintModal;
