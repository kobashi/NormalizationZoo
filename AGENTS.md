# Project Instructions

## Project goal

This project is an interactive browser-based teaching material for learning database normalization up to Third Normal Form.

The learner should understand normalization by experiencing data anomalies through record operations, not by memorizing definitions first.

## Target learners

Japanese undergraduate students learning databases for the first time.

## Language

All UI text, explanations, missions, warnings, and comments visible to learners must be in Japanese.

## Tech stack

- Vite
- React
- JavaScript
- Browser only
- No backend
- No database server
- No authentication

## Core learning flow

1. Show an unnormalized table.
2. Let the learner edit, add, and delete records.
3. Detect and visualize anomalies.
4. Explain the problem.
5. Move to the next normal form.
6. Repeat until 3NF.

## Stages

The current MVP uses an order / customer / sales domain instead of the student example below. Future refactoring may switch domains, but the essential learning flow must remain the same.

### Stage 0: 非正規形

Learner should notice:

- Repeating values are stored in one cell.
- Searching and updating are difficult.
- Values are not atomic.

Goal:
Explain First Normal Form.

### Stage 1: 第1正規形

Learner should experience:

- Update anomaly
- Delete anomaly
- Redundant repeated attributes

Goal:
Explain why entity information should be separated from repeating line items.

### Stage 2: 第2正規形

Learner should notice:

- Some attributes still depend on other non-key attributes.
- Redundancy remains after splitting repeating groups.
- Transitive dependency causes update inconsistency.

Goal:
Explain Third Normal Form.

### Stage 3: 第3正規形

Learner should notice:

- Facts can be updated in one place.
- Redundancy is reduced.
- Data is less likely to become inconsistent.

## UI requirements

- Use a clean educational layout.
- Show the current stage title.
- Show mission text.
- Show editable tables.
- Provide buttons:
  - 行追加
  - 行削除
  - 異常検出
  - 次の正規形へ
- Highlight problematic cells or rows.
- Show explanation messages below the table.
- Keep the UI simple enough for classroom use.

## Coding rules

- Prefer small React components.
- Keep anomaly detection logic separate from UI components when expanding beyond MVP.
- Use plain JavaScript objects for table data.
- Do not introduce unnecessary dependencies.
- Do not use a real database.
- Avoid overly abstract architecture at the MVP stage.

## Suggested file structure

src/
  App.jsx
  data/
    stages.js
  logic/
    anomalyDetectors.js
  components/
    EditableTable.jsx
    StageView.jsx
    FeedbackPanel.jsx
  styles.css

## Current implementation notes

- The current MVP is implemented primarily in `src/App.jsx`.
- UI text is in Japanese.
- State is fully local and there is no persistence layer.
- 3NF is treated as the stage where major anomalies become less likely.
- A future refactor can split stage data, anomaly detectors, and UI components into separate files.

## Definition of done

The project is done when:

- `npm install` succeeds.
- `npm run dev` starts the app.
- `npm run build` succeeds.
- The learner can complete the flow from 非正規形 to 第3正規形.
- Each stage includes at least one meaningful anomaly check.
- The README explains the educational purpose and how to run the app.
