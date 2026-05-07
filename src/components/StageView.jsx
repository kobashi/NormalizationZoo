import React from 'react';
import GlossaryText from './GlossaryText.jsx';

function StageView({
  stage,
  stageIndex,
  stageCount,
  isLastStage,
  onOpenHint,
  onNext
}) {
  return (
    <div className="card stage-card">
      <div className="stage-header">
        <div>
          <p className="eyebrow">現在の学習テーマ</p>
          <h2>{stage.title}</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenHint}>
          ヒント
        </button>
      </div>

      <div className="mission-box">
        <h3>ミッション</h3>
        <p><GlossaryText text={stage.mission} /></p>
      </div>

      <p className="description"><GlossaryText text={stage.description} /></p>

      <div className="stage-footer">
        <div className="goal-box">
          <span>この段階のねらい</span>
          <strong>{stage.goalLabel}</strong>
        </div>
        <button type="button" className="primary-button" onClick={onNext} disabled={isLastStage}>
          {isLastStage ? '最終ステージです' : `次の正規形へ (${stageIndex + 1}/${stageCount})`}
        </button>
      </div>
    </div>
  );
}

export default StageView;
