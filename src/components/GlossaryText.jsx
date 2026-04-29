import React from 'react';

const glossary = {
  原子的:
    '1つのセルに1つの値だけが入っている状態です。商品名と個数のような別の値を1つのセルへまとめません。',
  決定項がスーパーキーではない:
    'ある列が別の列の値を決めているのに、その列だけでは行を一意に特定できない状態です。BCNFではこれを分解したくなります。',
  組合せの直積:
    '2つの独立した集合について、ありうる組合せをすべて行として並べた状態です。行数が増えやすくなります。'
};

const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

function GlossaryText({ text }) {
  if (typeof text !== 'string') {
    return text;
  }

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    const description = glossary[part];
    if (!description) {
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    }

    return (
      <span key={`${part}-${index}`} className="glossary-term" tabIndex={0}>
        {part}
        <span className="glossary-tooltip">{description}</span>
      </span>
    );
  });
}

export default GlossaryText;
