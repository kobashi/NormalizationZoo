import React from 'react';
import { makeCellKey } from '../logic/anomalyDetectors.js';

function EditableTable({
  table,
  tableIndex,
  selectedRows,
  highlights,
  modifiedCells,
  analysis,
  onToggleRowSelection,
  onUpdateCell,
  onAddRow,
  onDeleteSelectedRows,
  onResetTable,
  onAnalyzeTable,
  feedbackSlot
}) {
  const selectedCount = selectedRows.length;
  const primaryKeySet = new Set(table.primaryKey ?? []);

  return (
    <div className="card table-card">
      <div className="table-card-header">
        <h3>{table.name}</h3>
        <div className="table-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onResetTable(tableIndex)}
          >
            リセット
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onAnalyzeTable(tableIndex)}
          >
            異常検出
          </button>
          <button type="button" className="secondary-button" onClick={() => onAddRow(tableIndex)}>
            行追加
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => onDeleteSelectedRows(tableIndex)}
            disabled={selectedCount === 0}
          >
            選択行を削除
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table style={table.minTableWidth ? { minWidth: `${table.minTableWidth}px` } : undefined}>
          <thead>
            <tr>
              <th>選択</th>
              {table.columns.map((column, colIndex) => (
                <th
                  key={column}
                  className={primaryKeySet.has(colIndex) ? 'key-column' : ''}
                >
                  <span className="column-header">
                    <span className="column-label">{column}</span>
                    {primaryKeySet.has(colIndex) ? (
                      <span className="key-badge">
                        {table.primaryKey.length > 1 ? '複合主キー' : '主キー'}
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const isSelected = selectedRows.includes(rowIndex);

              return (
                <tr key={`${table.name}-${rowIndex}`} className={isSelected ? 'selected-row' : ''}>
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleRowSelection(tableIndex, rowIndex)}
                      aria-label={`${table.name} ${rowIndex + 1}行を選択`}
                    />
                  </td>
                  {row.map((cell, colIndex) => {
                    const cellKey = makeCellKey(tableIndex, rowIndex, colIndex);
                    const isHighlighted = highlights?.has(cellKey);
                    const inputSize = Math.max(
                      String(cell ?? '').length,
                      String(table.columns[colIndex] ?? '').length,
                      6
                    );

                    return (
                      <td key={cellKey} className={isHighlighted ? 'highlight-cell' : ''}>
                        <input
                          value={cell}
                          size={inputSize}
                          className={modifiedCells?.has(cellKey) ? 'scenario-modified' : ''}
                          onChange={(event) =>
                            onUpdateCell(tableIndex, rowIndex, colIndex, event.target.value)
                          }
                          aria-label={`${table.name} ${rowIndex + 1}行 ${table.columns[colIndex]}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {feedbackSlot(analysis)}
    </div>
  );
}

export default EditableTable;
