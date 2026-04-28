import React from 'react';

function FeedbackPanel({ analysis }) {
  return (
    <div className="result-panel">
      {!analysis ? (
        <p className="placeholder">このテーブルで「異常検出」を押すと結果が表示されます。</p>
      ) : analysis.issues.length > 0 ? (
        <ul className="issue-list">
          {analysis.issues.map((issue, index) => (
            <li key={`issue-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : (
        <p className="success-message">
          このテーブルでは重大な異常は見つかりませんでした。必要な事実が分かれて管理されています。
        </p>
      )}
    </div>
  );
}

export default FeedbackPanel;
