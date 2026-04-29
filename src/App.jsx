import React, { useState } from 'react';
import EditableTable from './components/EditableTable.jsx';
import FeedbackPanel from './components/FeedbackPanel.jsx';
import HintModal from './components/HintModal.jsx';
import StageView from './components/StageView.jsx';
import { cloneTables, stages } from './data/stages.js';
import { analyzeStage } from './logic/anomalyDetectors.js';

const createInitialStageTables = () => stages.map((stage) => cloneTables(stage.tables));
const createInitialSelections = () => stages.map((stage) => stage.tables.map(() => []));
const createInitialScenarioMarks = () => stages.map((stage) => stage.tables.map(() => new Set()));
const createInitialStageNotes = () => stages.map(() => null);

const parsePrimaryKeyCounter = (rows, keyIndex) => {
  const samples = rows.map((row) => String(row[keyIndex] ?? '')).filter(Boolean);
  const prefixMatch = samples.find((value) => /^([A-Za-z]+-)\d+$/.test(value))?.match(
    /^([A-Za-z]+-)(\d+)$/
  );
  const numericMatch = samples.find((value) => /^\d+$/.test(value))?.match(/^(\d+)$/);

  const maxNumber = rows.reduce((max, row) => {
    const value = String(row[keyIndex] ?? '');
    const match = prefixMatch
      ? value.match(/^([A-Za-z]+-)(\d+)$/)
      : value.match(/^(\d+)$/);
    if (!match) {
      return max;
    }
    return Math.max(max, Number(match[match.length - 1]));
  }, 0);

  if (prefixMatch) {
    return {
      prefix: prefixMatch[1],
      width: prefixMatch[2].length,
      current: maxNumber
    };
  }

  if (numericMatch) {
    return {
      prefix: '',
      width: numericMatch[1].length,
      current: maxNumber
    };
  }

  return null;
};

const formatPrimaryKeyValue = (counter) => {
  if (!counter) {
    return '';
  }

  const nextNumber = counter.current + 1;
  if (counter.prefix) {
    return `${counter.prefix}${String(nextNumber).padStart(counter.width, '0')}`;
  }

  return String(nextNumber).padStart(counter.width, '0');
};

const cloneSingleTable = (table) => cloneTables([table])[0];

const createInitialAutoCounters = () =>
  stages.map((stage) =>
    stage.tables.map((table) => {
      if ((table.primaryKey?.length ?? 0) !== 1) {
        return null;
      }
      return parsePrimaryKeyCounter(table.rows, table.primaryKey[0]);
    })
  );

const filterAnalysisByTable = (fullAnalysis, tableIndex) => {
  const issues = fullAnalysis.issues.filter((issue) => {
    if (issue.tableIndices?.length) {
      return issue.tableIndices.includes(tableIndex);
    }
    if (issue.cells.length === 0) {
      return tableIndex === 0;
    }
    return issue.cells.some((cell) => Number(cell.split(':')[0]) === tableIndex);
  });
  const highlights = new Set(
    [...fullAnalysis.highlights].filter((cell) => Number(cell.split(':')[0]) === tableIndex)
  );
  return { issues, highlights };
};

const buildAutoCountersForTables = (tablesForStage) =>
  tablesForStage.map((table) => {
    if ((table.primaryKey?.length ?? 0) !== 1) {
      return null;
    }
    return parsePrimaryKeyCounter(table.rows, table.primaryKey[0]);
  });

const buildScenarioMarksForTables = (baselineTables, nextTables) =>
  nextTables.map((table, tableIndex) => {
    const baselineRows = baselineTables[tableIndex]?.rows ?? [];
    const marks = new Set();

    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const baselineCell = baselineRows[rowIndex]?.[colIndex];
        if (baselineCell !== cell) {
          marks.add(`${tableIndex}:${rowIndex}:${colIndex}`);
        }
      });
    });

    return marks;
  });

const scenarioExecutors = {
  unf: {
    '同じ顧客の住所を片方だけ変更': (tablesForStage) => {
      tablesForStage[0].rows[2][2] = '東京都港区9-9';
      return { analysisTables: [0] };
    },
    '商品・単価・個数を「,」区切りで追加': (tablesForStage) => {
      tablesForStage[0].rows[1][3] = 'コーヒー豆, クッキー';
      tablesForStage[0].rows[1][4] = '980, 420';
      tablesForStage[0].rows[1][5] = '1, 2';
      return { analysisTables: [0] };
    },
    '1行を削除して必要以上の記録が消えるか確認': (tablesForStage) => {
      tablesForStage[0].rows.splice(0, 1);
      return { analysisTables: [0] };
    }
  },
  '1nf': {
    '同じ注文IDの担当営業を片方だけ変更': (tablesForStage) => {
      tablesForStage[0].rows[1][6] = '伊藤';
      return { analysisTables: [0] };
    },
    '同じ注文IDの営業部門を片方だけ変更': (tablesForStage) => {
      tablesForStage[0].rows[1][7] = '西日本営業部';
      return { analysisTables: [0] };
    },
    '同じ商品の単価を片方だけ変更': (tablesForStage) => {
      tablesForStage[0].rows[4][2] = '150';
      return { analysisTables: [0] };
    },
    '顧客住所を1行だけ直す': (tablesForStage) => {
      tablesForStage[0].rows[4][5] = '千葉県千葉市5-5';
      return { analysisTables: [0] };
    },
    'ある顧客に対応する最後の1行を削除して、顧客情報が消えるか確認': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter((row) => row[4] !== '青空カフェ');
      return { analysisTables: [0] };
    },
    'ある商品の最後の1行を削除して、商品名と単価が消えるか確認': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter((row) => row[1] !== 'コーヒー豆');
      return { analysisTables: [0] };
    },
    '注文がない新規顧客や、新規商品だけを追加しようとしてみる': (tablesForStage) => {
      tablesForStage[0].rows.push([
        'O-103',
        '',
        '',
        '',
        '新規顧客サンプル',
        '大阪府大阪市1-2',
        '中村',
        '中部営業部'
      ]);
      tablesForStage[0].rows.push([
        '',
        '新商品サンプル',
        '500',
        '',
        '',
        '',
        '',
        ''
      ]);
      return { analysisTables: [0] };
    }
  },
  '2nf': {
    '明細の商品IDを存在しない値に変える': (tablesForStage) => {
      tablesForStage[1].rows[0][1] = 'P-99';
      return { analysisTables: [1] };
    },
    '同じ担当営業の部門名を片方だけ変更': (tablesForStage) => {
      tablesForStage[3].rows[2][4] = '北関東営業部';
      return { analysisTables: [3] };
    },
    '顧客行を追加してズレを作る': (tablesForStage) => {
      tablesForStage[3].rows.push([
        'C-04',
        '山川商会',
        '群馬県高崎市7-1',
        '佐藤',
        '西日本営業部'
      ]);
      return { analysisTables: [3] };
    },
    'ある担当営業に対応する最後の顧客行を削除して、担当者情報まで消えるか確認': (tablesForStage) => {
      tablesForStage[3].rows = tablesForStage[3].rows.filter((row) => row[3] !== '高橋');
      return { analysisTables: [3] };
    },
    '担当営業だけを追加しようとしてみる': (tablesForStage) => {
      tablesForStage[3].rows.push(['C-04', '', '', '中村', '中部営業部']);
      return { analysisTables: [3] };
    }
  },
  '3nf': {
    '顧客に存在しない担当営業IDを入れる': (tablesForStage) => {
      tablesForStage[3].rows[0][3] = 'S-99';
      return { analysisTables: [3] };
    },
    '明細に存在しない商品IDを入れる': (tablesForStage) => {
      tablesForStage[1].rows[0][1] = 'P-99';
      return { analysisTables: [1] };
    },
    '異常なしの状態に戻して比較する': () => {
      return { analysisTables: [0, 1, 2, 3, 4] };
    }
  },
  bcnf: {
    'S-01の訪問曜日を1行だけ変更': (tablesForStage) => {
      tablesForStage[0].rows[1][1] = '水曜';
      return { analysisTables: [0] };
    },
    'S-02の最後の行を削除': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter((row) => row[2] !== 'S-02');
      return { analysisTables: [0] };
    },
    '新しい担当営業だけ追加してみる': (tablesForStage) => {
      tablesForStage[0].rows.push(['', '金曜', 'S-03']);
      return { analysisTables: [0] };
    }
  },
  '4nf': {
    'P-01に新しい仕入先を1つ追加': (tablesForStage) => {
      tablesForStage[0].rows.push(['P-01', '中央青果', '店舗販売']);
      return { analysisTables: [0] };
    },
    'P-01の1行だけ削除': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter(
        (row) => !(row[0] === 'P-01' && row[1] === '北果物商事' && row[2] === 'EC販売')
      );
      return { analysisTables: [0] };
    },
    'P-01に新しい販売チャネルを追加': (tablesForStage) => {
      tablesForStage[0].rows.push(['P-01', '北果物商事', '催事販売']);
      return { analysisTables: [0] };
    }
  },
  '5nf': {
    '1つの三者組だけ削除': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter(
        (row) => !(row[0] === 'りんごジュース' && row[1] === '青空マート' && row[2] === 'ひかり配送')
      );
      return { analysisTables: [0] };
    },
    '成立しそうな三者組を1つ追加': (tablesForStage) => {
      tablesForStage[0].rows.push(['みかんジャム', '青空マート', 'ひかり配送']);
      return { analysisTables: [0] };
    },
    '販売店と配送業者の対応を1行だけ変える': (tablesForStage) => {
      tablesForStage[0].rows[2][2] = 'ひかり配送';
      return { analysisTables: [0] };
    }
  }
};

const tediousScenarioExecutors = {
  '1nf': {
    '田中商店の住所を正しく変更する': (tablesForStage) => {
      tablesForStage[0].rows.forEach((row) => {
        if (row[4] === '田中商店') {
          row[5] = '東京都港区9-9';
        }
      });
    },
    'りんごの価格改定を正しく反映する': (tablesForStage) => {
      tablesForStage[0].rows.forEach((row) => {
        if (row[1] === 'りんご') {
          row[2] = '140';
        }
      });
    }
  },
  '2nf': {
    '佐藤の営業部門名を正しく変更する': (tablesForStage) => {
      tablesForStage[3].rows.forEach((row) => {
        if (row[3] === '佐藤') {
          row[4] = '首都圏営業部';
        }
      });
    },
    '新しい担当営業を2社の顧客付きで登録する': (tablesForStage) => {
      tablesForStage[3].rows.push(['C-04', '山川商会', '群馬県高崎市7-1', '中村', '中部営業部']);
      tablesForStage[3].rows.push(['C-05', '海風ストア', '静岡県静岡市4-3', '中村', '中部営業部']);
    }
  },
  '3nf': {
    '新しい注文を2商品で登録する': (tablesForStage) => {
      tablesForStage[0].rows.push(['O-103', 'C-02']);
      tablesForStage[1].rows.push(['O-103', 'P-02', '2']);
      tablesForStage[1].rows.push(['O-103', 'P-06', '1']);
    },
    '注文O-101を正しく取り消す': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter((row) => row[0] !== 'O-101');
      tablesForStage[1].rows = tablesForStage[1].rows.filter((row) => row[0] !== 'O-101');
    }
  },
  bcnf: {
    'S-01の訪問曜日を正しく変更する': (tablesForStage) => {
      tablesForStage[0].rows.forEach((row) => {
        if (row[2] === 'S-01') {
          row[1] = '水曜';
        }
      });
    },
    '新しい担当営業S-03を2顧客に割り当てて登録する': (tablesForStage) => {
      tablesForStage[0].rows.push(['C-04', '金曜', 'S-03']);
      tablesForStage[0].rows.push(['C-05', '金曜', 'S-03']);
    }
  },
  '4nf': {
    'P-01に新しい仕入先を正しく追加する': (tablesForStage) => {
      tablesForStage[0].rows.push(['P-01', '中央青果', '店舗販売']);
      tablesForStage[0].rows.push(['P-01', '中央青果', 'EC販売']);
    },
    'P-01に新しい販売チャネルを正しく追加する': (tablesForStage) => {
      tablesForStage[0].rows.push(['P-01', '北果物商事', '催事販売']);
      tablesForStage[0].rows.push(['P-01', '南青果センター', '催事販売']);
    }
  },
  '5nf': {
    '青空マートがりんごジュースの取扱いをやめる': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter(
        (row) => !(row[0] === 'りんごジュース' && row[1] === '青空マート')
      );
    },
    'りんごジュースをさくら便で配送できなくする': (tablesForStage) => {
      tablesForStage[0].rows = tablesForStage[0].rows.filter(
        (row) => !(row[0] === 'りんごジュース' && row[2] === 'さくら便')
      );
    },
    '青空マートがみかんジャムを扱えるようにする': (tablesForStage) => {
      tablesForStage[0].rows.push(['みかんジャム', '青空マート', 'さくら便']);
      tablesForStage[0].rows.push(['みかんジャム', '青空マート', 'ひかり配送']);
    }
  }
};

function App() {
  const [stageIndex, setStageIndex] = useState(0);
  const [isHintOpen, setIsHintOpen] = useState(false);
  const [stageTables, setStageTables] = useState(createInitialStageTables);
  const [analysis, setAnalysis] = useState({});
  const [selectedRowsByStage, setSelectedRowsByStage] = useState(createInitialSelections);
  const [autoCountersByStage, setAutoCountersByStage] = useState(createInitialAutoCounters);
  const [scenarioMarksByStage, setScenarioMarksByStage] = useState(createInitialScenarioMarks);
  const [stageNotes, setStageNotes] = useState(createInitialStageNotes);

  const stage = stages[stageIndex];
  const tables = stageTables[stageIndex];
  const selectedRows = selectedRowsByStage[stageIndex];
  const stageAnalysis = analysis[stage.id] ?? [];
  const stageNote = stageNotes[stageIndex];
  const isLastStage = stageIndex === stages.length - 1;

  const clearStageNote = () => {
    setStageNotes((prev) => prev.map((note, index) => (index === stageIndex ? null : note)));
  };

  const clearStageFeedback = () => {
    setAnalysis((prev) => {
      if (!prev[stage.id]) {
        return prev;
      }
      const next = { ...prev };
      delete next[stage.id];
      return next;
    });
  };

  const updateStageTables = (updater) => {
    setStageTables((prev) =>
      prev.map((tablesForStage, sIndex) => {
        if (sIndex !== stageIndex) {
          return tablesForStage;
        }
        return updater(tablesForStage);
      })
    );
    setScenarioMarksByStage((prev) =>
      prev.map((marksForStage, sIndex) =>
        sIndex === stageIndex ? marksForStage.map(() => new Set()) : marksForStage
      )
    );
    clearStageFeedback();
    clearStageNote();
  };

  const updateCell = (tableIndex, rowIndex, colIndex, value) => {
    updateStageTables((tablesForStage) =>
      tablesForStage.map((table, tIndex) => {
        if (tIndex !== tableIndex) {
          return table;
        }
        return {
          ...table,
          rows: table.rows.map((row, rIndex) =>
            rIndex === rowIndex
              ? row.map((cell, cIndex) => (cIndex === colIndex ? value : cell))
              : row
          )
        };
      })
    );
  };

  const addRow = (tableIndex) => {
    const table = tables[tableIndex];
    let generatedPrimaryKey = '';

    if ((table.primaryKey?.length ?? 0) === 1) {
      const counter = autoCountersByStage[stageIndex][tableIndex];
      generatedPrimaryKey = formatPrimaryKeyValue(counter);
      setAutoCountersByStage((prev) =>
        prev.map((stageCounters, sIndex) => {
          if (sIndex !== stageIndex) {
            return stageCounters;
          }
          return stageCounters.map((tableCounter, tIndex) => {
            if (tIndex !== tableIndex || !tableCounter) {
              return tableCounter;
            }
            return { ...tableCounter, current: tableCounter.current + 1 };
          });
        })
      );
    }

    updateStageTables((tablesForStage) =>
      tablesForStage.map((currentTable, tIndex) => {
        if (tIndex !== tableIndex) {
          return currentTable;
        }

        const newRow = currentTable.columns.map(() => '');
        if ((currentTable.primaryKey?.length ?? 0) === 1) {
          const keyIndex = currentTable.primaryKey[0];
          newRow[keyIndex] = generatedPrimaryKey;
        }

        return {
          ...currentTable,
          rows: [...currentTable.rows, newRow]
        };
      })
    );
  };

  const toggleRowSelection = (tableIndex, rowIndex) => {
    setSelectedRowsByStage((prev) =>
      prev.map((tablesForStage, sIndex) => {
        if (sIndex !== stageIndex) {
          return tablesForStage;
        }
        return tablesForStage.map((selectedForTable, tIndex) => {
          if (tIndex !== tableIndex) {
            return selectedForTable;
          }
          return selectedForTable.includes(rowIndex)
            ? selectedForTable.filter((index) => index !== rowIndex)
            : [...selectedForTable, rowIndex].sort((a, b) => a - b);
        });
      })
    );
  };

  const deleteSelectedRows = (tableIndex) => {
    const rowsToDelete = selectedRows[tableIndex];
    if (!rowsToDelete || rowsToDelete.length === 0) {
      return;
    }

    updateStageTables((tablesForStage) =>
      tablesForStage.map((table, tIndex) => {
        if (tIndex !== tableIndex) {
          return table;
        }
        return {
          ...table,
          rows: table.rows.filter((_, rowIndex) => !rowsToDelete.includes(rowIndex))
        };
      })
    );

    setSelectedRowsByStage((prev) =>
      prev.map((tablesForStage, sIndex) => {
        if (sIndex !== stageIndex) {
          return tablesForStage;
        }
        return tablesForStage.map((selectedForTable, tIndex) =>
          tIndex === tableIndex ? [] : selectedForTable
        );
      })
    );
  };

  const resetTable = (tableIndex) => {
    setStageTables((prev) =>
      prev.map((tablesForStage, sIndex) => {
        if (sIndex !== stageIndex) {
          return tablesForStage;
        }
        return tablesForStage.map((table, tIndex) =>
          tIndex === tableIndex ? cloneSingleTable(stages[sIndex].tables[tIndex]) : table
        );
      })
    );
    setSelectedRowsByStage((prev) =>
      prev.map((selectedForStage, sIndex) => {
        if (sIndex !== stageIndex) {
          return selectedForStage;
        }
        return selectedForStage.map((selectedForTable, tIndex) =>
          tIndex === tableIndex ? [] : selectedForTable
        );
      })
    );
    setAutoCountersByStage((prev) =>
      prev.map((stageCounters, sIndex) => {
        if (sIndex !== stageIndex) {
          return stageCounters;
        }
        return stageCounters.map((tableCounter, tIndex) => {
          if (tIndex !== tableIndex) {
            return tableCounter;
          }
          const stageTable = stages[sIndex].tables[tIndex];
          if ((stageTable.primaryKey?.length ?? 0) !== 1) {
            return null;
          }
          return parsePrimaryKeyCounter(stageTable.rows, stageTable.primaryKey[0]);
        });
      })
    );
    setScenarioMarksByStage((prev) =>
      prev.map((marksForStage, sIndex) =>
        sIndex === stageIndex
          ? marksForStage.map((marks, tIndex) => (tIndex === tableIndex ? new Set() : marks))
          : marksForStage
      )
    );
    clearStageFeedback();
  };

  const runAnalysis = (tableIndex) => {
    const result = analyzeStage(stage.id, tables, stages[stageIndex].tables);
    const filtered = filterAnalysisByTable(result, tableIndex);
    setAnalysis((prev) => {
      const nextStageAnalysis = prev[stage.id] ? [...prev[stage.id]] : tables.map(() => null);
      nextStageAnalysis[tableIndex] = filtered;
      return { ...prev, [stage.id]: nextStageAnalysis };
    });
    clearStageNote();
  };

  const moveNext = () => {
    setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    setIsHintOpen(false);
  };

  const runTipScenario = (tipLabel) => {
    const executor = scenarioExecutors[stage.id]?.[tipLabel];
    if (!executor) {
      return;
    }

    const baselineTables = cloneTables(stages[stageIndex].tables);
    const nextTablesForStage = cloneTables(stages[stageIndex].tables);
    const outcome = executor(nextTablesForStage) ?? {};
    const analysisTables = outcome.analysisTables ?? [0];
    const fullAnalysis = analyzeStage(stage.id, nextTablesForStage, stages[stageIndex].tables);
    const nextStageAnalysis = nextTablesForStage.map((_, tableIndex) =>
      analysisTables.includes(tableIndex) ? filterAnalysisByTable(fullAnalysis, tableIndex) : null
    );
    const nextScenarioMarks = buildScenarioMarksForTables(baselineTables, nextTablesForStage);

    setStageTables((prev) =>
      prev.map((tablesForStage, sIndex) => (sIndex === stageIndex ? nextTablesForStage : tablesForStage))
    );
    setSelectedRowsByStage((prev) =>
      prev.map((selectedForStage, sIndex) =>
        sIndex === stageIndex ? nextTablesForStage.map(() => []) : selectedForStage
      )
    );
    setAutoCountersByStage((prev) =>
      prev.map((stageCounters, sIndex) =>
        sIndex === stageIndex ? buildAutoCountersForTables(nextTablesForStage) : stageCounters
      )
    );
    setScenarioMarksByStage((prev) =>
      prev.map((marksForStage, sIndex) => (sIndex === stageIndex ? nextScenarioMarks : marksForStage))
    );
    setAnalysis((prev) => ({ ...prev, [stage.id]: nextStageAnalysis }));
    clearStageNote();
  };

  const runTediousScenario = (scenarioLabel) => {
    const executor = tediousScenarioExecutors[stage.id]?.[scenarioLabel];
    const scenario = stage.tediousScenarios?.find((item) => item.label === scenarioLabel);
    if (!executor || !scenario) {
      return;
    }

    const baselineTables = cloneTables(stages[stageIndex].tables);
    const nextTablesForStage = cloneTables(stages[stageIndex].tables);
    executor(nextTablesForStage);
    const nextScenarioMarks = buildScenarioMarksForTables(baselineTables, nextTablesForStage);

    setStageTables((prev) =>
      prev.map((tablesForStage, sIndex) => (sIndex === stageIndex ? nextTablesForStage : tablesForStage))
    );
    setSelectedRowsByStage((prev) =>
      prev.map((selectedForStage, sIndex) =>
        sIndex === stageIndex ? nextTablesForStage.map(() => []) : selectedForStage
      )
    );
    setAutoCountersByStage((prev) =>
      prev.map((stageCounters, sIndex) =>
        sIndex === stageIndex ? buildAutoCountersForTables(nextTablesForStage) : stageCounters
      )
    );
    setScenarioMarksByStage((prev) =>
      prev.map((marksForStage, sIndex) => (sIndex === stageIndex ? nextScenarioMarks : marksForStage))
    );
    setAnalysis((prev) => ({
      ...prev,
      [stage.id]: nextTablesForStage.map(() => null)
    }));
    setStageNotes((prev) =>
      prev.map((note, sIndex) =>
        sIndex === stageIndex
          ? { title: '面倒だけど正しい操作', message: scenario.message }
          : note
      )
    );
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">データベース正規化学習教材</p>
          <h1>操作して学ぶ 正規化ラボ</h1>
          <p className="lead">
            セル編集・行追加・行削除を通じて、更新異常・挿入異常・削除異常を体験します。
          </p>
        </div>
        <div className="stage-chip">
          <span>進行状況</span>
          <strong>
            {stageIndex + 1} / {stages.length}
          </strong>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar card">
          <p className="sidebar-label">ステージ</p>
          <div className="stage-list">
            {stages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`stage-button ${index === stageIndex ? 'active' : ''}`}
                onClick={() => setStageIndex(index)}
              >
                <span>{item.label}</span>
                <small>{index + 1}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="content">
          <StageView
            stage={stage}
            stageIndex={stageIndex}
            stageCount={stages.length}
            isLastStage={isLastStage}
            onOpenHint={() => setIsHintOpen(true)}
            onRunTip={runTipScenario}
            onRunTediousScenario={runTediousScenario}
            scenarioNote={stageNote}
            onNext={moveNext}
          />

          <div className="tables-area">
            {tables.map((table, tableIndex) => (
              <EditableTable
                key={table.name}
                table={table}
                tableIndex={tableIndex}
                selectedRows={selectedRows[tableIndex] ?? []}
                highlights={stageAnalysis[tableIndex]?.highlights}
                modifiedCells={scenarioMarksByStage[stageIndex][tableIndex]}
                analysis={stageAnalysis[tableIndex]}
                onToggleRowSelection={toggleRowSelection}
                onUpdateCell={updateCell}
                onAddRow={addRow}
                onDeleteSelectedRows={deleteSelectedRows}
                onResetTable={resetTable}
                onAnalyzeTable={runAnalysis}
                feedbackSlot={(tableAnalysis) => <FeedbackPanel analysis={tableAnalysis} />}
              />
            ))}
          </div>
        </section>
      </main>

      <HintModal stage={stage} isOpen={isHintOpen} onClose={() => setIsHintOpen(false)} />
    </div>
  );
}

export default App;
