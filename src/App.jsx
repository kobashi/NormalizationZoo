import React, { useState } from 'react';
import EditableTable from './components/EditableTable.jsx';
import FeedbackPanel from './components/FeedbackPanel.jsx';
import HintModal from './components/HintModal.jsx';
import StageView from './components/StageView.jsx';
import { cloneTables, stages } from './data/stages.js';
import { analyzeStage } from './logic/anomalyDetectors.js';

const createInitialStageTables = () => stages.map((stage) => cloneTables(stage.tables));
const createInitialSelections = () => stages.map((stage) => stage.tables.map(() => []));

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

function App() {
  const [stageIndex, setStageIndex] = useState(0);
  const [isHintOpen, setIsHintOpen] = useState(false);
  const [stageTables, setStageTables] = useState(createInitialStageTables);
  const [analysis, setAnalysis] = useState({});
  const [selectedRowsByStage, setSelectedRowsByStage] = useState(createInitialSelections);
  const [autoCountersByStage, setAutoCountersByStage] = useState(createInitialAutoCounters);

  const stage = stages[stageIndex];
  const tables = stageTables[stageIndex];
  const selectedRows = selectedRowsByStage[stageIndex];
  const stageAnalysis = analysis[stage.id] ?? [];
  const isLastStage = stageIndex === stages.length - 1;

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
    clearStageFeedback();
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
  };

  const moveNext = () => {
    setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    setIsHintOpen(false);
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
