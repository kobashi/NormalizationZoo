export const makeCellKey = (tableIndex, rowIndex, colIndex) =>
  `${tableIndex}:${rowIndex}:${colIndex}`;

export function analyzeStage(stageId, tables, baselineTables = null) {
  const issues = [];
  const highlights = new Set();

  const addIssue = (message, cells = [], tableIndices = []) => {
    issues.push({ message, cells, tableIndices });
    cells.forEach((cell) => highlights.add(cell));
  };

  if (stageId === 'unf') {
    const table = tables[0];
    const customerAddressMap = new Map();

    table.rows.forEach((row, rowIndex) => {
      const productCell = row[3] ?? '';
      const priceCell = row[4] ?? '';
      const quantityCell = row[5] ?? '';
      const orderId = row[0] ?? '';
      const customer = row[1] ?? '';
      const address = row[2] ?? '';
      const productParts = productCell
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const priceParts = priceCell
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const quantityParts = quantityCell
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      if (productParts.length > 1 || priceParts.length > 1 || quantityParts.length > 1) {
        addIssue(
          `行${rowIndex + 1}: 商品、単価、個数に複数値が入り、1セル1値ではありません。カンマ区切りのままでは更新異常が起こりやすいです。`,
          [makeCellKey(0, rowIndex, 3), makeCellKey(0, rowIndex, 4), makeCellKey(0, rowIndex, 5)]
        );
      }

      if (
        productParts.length !== priceParts.length ||
        productParts.length !== quantityParts.length
      ) {
        addIssue(
          `行${rowIndex + 1}: 商品、単価、個数の数が一致していません。どの単価や個数がどの商品に対応するのか分からなくなっています。`,
          [makeCellKey(0, rowIndex, 3), makeCellKey(0, rowIndex, 4), makeCellKey(0, rowIndex, 5)]
        );
      }

      if (productParts.length > 1) {
        addIssue(
          `行${rowIndex + 1}: このレコードを削除すると、注文ID「${orderId}」に含まれる「${productParts.join('、')}」の明細と、その単価・個数がまとめて失われます。1つの事実だけ消したいのに複数の記録が消える更新異常です。`,
          [
            makeCellKey(0, rowIndex, 0),
            makeCellKey(0, rowIndex, 3),
            makeCellKey(0, rowIndex, 4),
            makeCellKey(0, rowIndex, 5)
          ]
        );
      }

      if (customer) {
        const prev = customerAddressMap.get(customer);
        if (prev && prev.address !== address) {
          addIssue(
            `「${customer}」の住所が行ごとに一致していません。顧客情報の更新異常です。`,
            [makeCellKey(0, prev.rowIndex, 2), makeCellKey(0, rowIndex, 2)]
          );
        } else if (!prev) {
          customerAddressMap.set(customer, { address, rowIndex });
        }
      }
    });
  }

  if (stageId === '1nf') {
    const table = tables[0];
    const baselineTable = baselineTables?.[0];
    const orderInfoMap = new Map();
    const customerRows = new Map();
    const productRows = new Map();

    table.rows.forEach((row, rowIndex) => {
      const orderId = row[0] ?? '';
      const product = row[1] ?? '';
      const price = row[2] ?? '';
      const quantity = row[3] ?? '';
      const customer = row[4] ?? '';
      const address = row[5] ?? '';
      const sales = row[6] ?? '';

      if (!orderId || !product || !quantity) {
        addIssue(
          `行${rowIndex + 1}: 注文ID、商品名、注文個数のいずれかが空です。明細を追加しても注文を正しく表現できません。`,
          [makeCellKey(0, rowIndex, 0), makeCellKey(0, rowIndex, 1), makeCellKey(0, rowIndex, 3)]
        );
      }

      if (orderId) {
        const prev = orderInfoMap.get(orderId);
        const snapshot = JSON.stringify([customer, address, sales]);
        if (prev && prev.snapshot !== snapshot) {
          addIssue(
            `注文ID「${orderId}」に対する顧客情報または担当営業が行によって異なります。重複更新のズレです。`,
            [
              makeCellKey(0, prev.rowIndex, 4),
              makeCellKey(0, prev.rowIndex, 5),
              makeCellKey(0, prev.rowIndex, 6),
              makeCellKey(0, rowIndex, 4),
              makeCellKey(0, rowIndex, 5),
              makeCellKey(0, rowIndex, 6)
            ]
          );
        } else if (!prev) {
          orderInfoMap.set(orderId, { snapshot, rowIndex });
        }
      }

      if (customer) {
        if (!customerRows.has(customer)) {
          customerRows.set(customer, []);
        }
        customerRows.get(customer).push({ rowIndex, address, sales });
      }

      if (!product) {
        return;
      }
      if (!productRows.has(product)) {
        productRows.set(product, []);
      }
      productRows.get(product).push({ rowIndex, price });
    });

    customerRows.forEach((entries, customer) => {
      const addresses = new Set(entries.map((entry) => entry.address));
      const salesPeople = new Set(entries.map((entry) => entry.sales));

      if (addresses.size > 1 || salesPeople.size > 1) {
        addIssue(
          `顧客「${customer}」の情報が複数行で一致していません。顧客属性が注文明細に混在しています。`,
          entries.flatMap((entry) => [
            makeCellKey(0, entry.rowIndex, 5),
            makeCellKey(0, entry.rowIndex, 6)
          ])
        );
      }
    });

    productRows.forEach((entries, product) => {
      const prices = new Set(entries.map((entry) => entry.price));
      if (prices.size > 1) {
        addIssue(
          `商品「${product}」の単価が複数行で一致していません。商品単価が明細に混在しているため更新異常が起きています。`,
          entries.map((entry) => makeCellKey(0, entry.rowIndex, 2))
        );
      } else if (entries.length > 1) {
        addIssue(
          `商品「${product}」の単価が複数行に繰り返し保存されています。商品単価は商品ごとに1か所で管理したくなります。`,
          entries.map((entry) => makeCellKey(0, entry.rowIndex, 2))
        );
      }
    });

    if (baselineTable) {
      const baselineCustomers = new Map();
      const baselineProducts = new Map();

      baselineTable.rows.forEach((row) => {
        const customer = row[4] ?? '';
        const address = row[5] ?? '';
        const sales = row[6] ?? '';
        const product = row[1] ?? '';
        const price = row[2] ?? '';

        if (customer && !baselineCustomers.has(customer)) {
          baselineCustomers.set(customer, { address, sales });
        }
        if (product && !baselineProducts.has(product)) {
          baselineProducts.set(product, { price });
        }
      });

      baselineCustomers.forEach((info, customer) => {
        if (!customerRows.has(customer)) {
          addIssue(
            `削除の結果、顧客「${customer}」の注文行がすべて消え、住所「${info.address}」や担当営業「${info.sales}」もテーブルから失われました。顧客情報まで一緒に消える削除異常です。`
          );
        }
      });

      baselineProducts.forEach((info, product) => {
        if (!productRows.has(product)) {
          addIssue(
            `削除の結果、商品「${product}」の注文行がすべて消え、単価「${info.price}」もテーブルから失われました。商品の事実まで一緒に消える削除異常です。`
          );
        }
      });
    }

    addIssue(
      'この表では、注文がまだない新規顧客だけを追加できません。注文IDや商品名を伴わないと顧客情報を登録できない挿入異常があります。',
      [],
      [0]
    );
    addIssue(
      'この表では、まだ注文されていない新規商品だけを追加できません。商品名や単価を注文と切り離して登録できない挿入異常があります。',
      [],
      [0]
    );
  }

  if (stageId === '2nf') {
    const orders = tables[0];
    const lineItems = tables[1];
    const products = tables[2];
    const customers = tables[3];
    const baselineCustomers = baselineTables?.[3];
    const salesDeptMap = new Map();
    const orderIdSet = new Set(orders.rows.map((row) => row[0]).filter(Boolean));
    const productIdSet = new Set(products.rows.map((row) => row[0]).filter(Boolean));
    const customerIdSet = new Set(customers.rows.map((row) => row[0]).filter(Boolean));

    orders.rows.forEach((row, rowIndex) => {
      const customerId = row[1] ?? '';
      if (customerId && !customerIdSet.has(customerId)) {
        addIssue(
          `注文テーブルの顧客ID「${customerId}」に対応する顧客が存在しません。分解後は参照関係の維持が必要です。`,
          [makeCellKey(0, rowIndex, 1)]
        );
      }
    });

    lineItems.rows.forEach((row, rowIndex) => {
      const orderId = row[0] ?? '';
      const productId = row[1] ?? '';

      if (orderId && !orderIdSet.has(orderId)) {
        addIssue(
          `注文明細の注文ID「${orderId}」に対応する注文が存在しません。`,
          [makeCellKey(1, rowIndex, 0)]
        );
      }

      if (productId && !productIdSet.has(productId)) {
        addIssue(
          `注文明細の商品ID「${productId}」に対応する商品が存在しません。`,
          [makeCellKey(1, rowIndex, 1)]
        );
      }
    });

    const productInfoMap = new Map();
    products.rows.forEach((row, rowIndex) => {
      const productId = row[0] ?? '';
      const snapshot = JSON.stringify([row[1] ?? '', row[2] ?? '']);
      if (!productId) {
        return;
      }
      const prev = productInfoMap.get(productId);
      if (prev && prev.snapshot !== snapshot) {
        addIssue(
          `商品ID「${productId}」の情報が複数行で一致していません。`,
          [
            makeCellKey(2, prev.rowIndex, 1),
            makeCellKey(2, prev.rowIndex, 2),
            makeCellKey(2, rowIndex, 1),
            makeCellKey(2, rowIndex, 2)
          ]
        );
      } else if (!prev) {
        productInfoMap.set(productId, { snapshot, rowIndex });
      }
    });

    customers.rows.forEach((row, rowIndex) => {
      const sales = row[3] ?? '';
      const dept = row[4] ?? '';

      if (!sales) {
        return;
      }

      const prev = salesDeptMap.get(sales);
      if (prev && prev.dept !== dept) {
        addIssue(
          `担当営業「${sales}」の営業部門が顧客行ごとに一致していません。推移的従属による更新異常です。`,
          [makeCellKey(3, prev.rowIndex, 4), makeCellKey(3, rowIndex, 4)]
        );
      } else if (!prev) {
        salesDeptMap.set(sales, { dept, rowIndex });
      }
    });

    if (baselineCustomers) {
      const baselineSalesMap = new Map();
      baselineCustomers.rows.forEach((row) => {
        const sales = row[3] ?? '';
        const dept = row[4] ?? '';
        if (sales && !baselineSalesMap.has(sales)) {
          baselineSalesMap.set(sales, { dept });
        }
      });

      baselineSalesMap.forEach((info, sales) => {
        const stillExists = customers.rows.some((row) => (row[3] ?? '') === sales);
        if (!stillExists) {
          addIssue(
            `削除の結果、担当営業「${sales}」を参照する顧客行がすべて消え、営業部門「${info.dept}」を含む担当者情報もテーブルから失われました。担当者の事実まで一緒に消える削除異常です。`,
            [],
            [3]
          );
        }
      });
    }

    addIssue(
      'この段階では、担当営業だけを独立して追加できません。顧客行を伴わないと担当営業名や営業部門を登録できない挿入異常があります。',
      [],
      [3]
    );
  }

  if (stageId === '3nf') {
    const orders = tables[0];
    const lineItems = tables[1];
    const products = tables[2];
    const customers = tables[3];
    const reps = tables[4];
    const orderIds = new Set(orders.rows.map((row) => row[0]).filter(Boolean));
    const productIds = new Set(products.rows.map((row) => row[0]).filter(Boolean));
    const customerIds = new Set(customers.rows.map((row) => row[0]).filter(Boolean));
    const repIds = new Set(reps.rows.map((row) => row[0]).filter(Boolean));
    const repInfoMap = new Map();

    orders.rows.forEach((row, rowIndex) => {
      const customerId = row[1] ?? '';
      if (customerId && !customerIds.has(customerId)) {
        addIssue(
          `注文テーブルの顧客ID「${customerId}」に対応する顧客がありません。`,
          [makeCellKey(0, rowIndex, 1)]
        );
      }
    });

    lineItems.rows.forEach((row, rowIndex) => {
      const orderId = row[0] ?? '';
      const productId = row[1] ?? '';
      if (orderId && !orderIds.has(orderId)) {
        addIssue(
          `注文明細の注文ID「${orderId}」に対応する注文がありません。`,
          [makeCellKey(1, rowIndex, 0)]
        );
      }
      if (productId && !productIds.has(productId)) {
        addIssue(
          `注文明細の商品ID「${productId}」に対応する商品がありません。`,
          [makeCellKey(1, rowIndex, 1)]
        );
      }
    });

    customers.rows.forEach((row, rowIndex) => {
      const repId = row[3] ?? '';
      if (repId && !repIds.has(repId)) {
        addIssue(
          `顧客テーブルの担当営業ID「${repId}」に対応する営業担当がありません。`,
          [makeCellKey(3, rowIndex, 3)]
        );
      }
    });

    reps.rows.forEach((row, rowIndex) => {
      const repId = row[0] ?? '';
      const name = row[1] ?? '';
      const dept = row[2] ?? '';
      const snapshot = JSON.stringify([name, dept]);

      if (!repId) {
        addIssue(
          `営業担当テーブルの行${rowIndex + 1}で担当営業IDが空です。`,
          [makeCellKey(4, rowIndex, 0)]
        );
      }

      const prev = repInfoMap.get(repId);
      if (prev && prev.snapshot !== snapshot) {
        addIssue(
          `担当営業ID「${repId}」の情報が複数行で一致していません。`,
          [
            makeCellKey(4, prev.rowIndex, 1),
            makeCellKey(4, prev.rowIndex, 2),
            makeCellKey(4, rowIndex, 1),
            makeCellKey(4, rowIndex, 2)
          ]
        );
      } else if (!prev) {
        repInfoMap.set(repId, { snapshot, rowIndex });
      }
    });

  }

  return { issues, highlights };
}
