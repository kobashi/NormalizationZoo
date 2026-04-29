export const makeCellKey = (tableIndex, rowIndex, colIndex) =>
  `${tableIndex}:${rowIndex}:${colIndex}`;

export function analyzeStage(stageId, tables, baselineTables = null) {
  const issues = [];
  const highlights = new Set();

  const addIssue = (message, cells = [], tableIndices = []) => {
    issues.push({ message, cells, tableIndices });
    cells.forEach((cell) => highlights.add(cell));
  };

  tables.forEach((table, tableIndex) => {
    const primaryKey = table.primaryKey ?? [];
    if (primaryKey.length === 0) {
      return;
    }

    const seenKeys = new Map();

    table.rows.forEach((row, rowIndex) => {
      const keyValues = primaryKey.map((colIndex) => String(row[colIndex] ?? '').trim());
      if (keyValues.some((value) => value === '')) {
        return;
      }

      const keyText = keyValues.join('::');
      const keyCells = primaryKey.map((colIndex) => makeCellKey(tableIndex, rowIndex, colIndex));
      const prev = seenKeys.get(keyText);

      if (prev) {
        addIssue(
          primaryKey.length > 1
            ? `複合主キー「${keyValues.join(' + ')}」が重複しています。同じ主キーを持つ行を挿入してしまっており、更新異常の原因になります。`
            : `主キー「${keyValues[0]}」が重複しています。同じ主キーを持つ行を挿入してしまっており、更新異常の原因になります。`,
          [...prev.keyCells, ...keyCells],
          [tableIndex]
        );
      } else {
        seenKeys.set(keyText, { keyCells });
      }
    });
  });

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
      const sales = row[6] ?? '';
      const division = row[7] ?? '';
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
        if (prev && (prev.address !== address || prev.sales !== sales || prev.division !== division)) {
          addIssue(
            `「${customer}」の住所、担当営業、または営業部門が行ごとに一致していません。顧客情報の更新異常です。`,
            [
              makeCellKey(0, prev.rowIndex, 2),
              makeCellKey(0, prev.rowIndex, 6),
              makeCellKey(0, prev.rowIndex, 7),
              makeCellKey(0, rowIndex, 2),
              makeCellKey(0, rowIndex, 6),
              makeCellKey(0, rowIndex, 7)
            ]
          );
        } else if (!prev) {
          customerAddressMap.set(customer, { address, sales, division, rowIndex });
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
      const division = row[7] ?? '';

      if (!orderId || !product || !quantity) {
        addIssue(
          `行${rowIndex + 1}: 注文ID、商品名、注文個数のいずれかが空です。明細を追加しても注文を正しく表現できません。`,
          [makeCellKey(0, rowIndex, 0), makeCellKey(0, rowIndex, 1), makeCellKey(0, rowIndex, 3)]
        );
      }

      if (orderId) {
        const prev = orderInfoMap.get(orderId);
        const snapshot = JSON.stringify([customer, address, sales, division]);
        if (prev && prev.snapshot !== snapshot) {
          addIssue(
            `注文ID「${orderId}」に対する顧客情報、担当営業、または営業部門が行によって異なります。重複更新のズレです。`,
            [
              makeCellKey(0, prev.rowIndex, 4),
              makeCellKey(0, prev.rowIndex, 5),
              makeCellKey(0, prev.rowIndex, 6),
              makeCellKey(0, prev.rowIndex, 7),
              makeCellKey(0, rowIndex, 4),
              makeCellKey(0, rowIndex, 5),
              makeCellKey(0, rowIndex, 6),
              makeCellKey(0, rowIndex, 7)
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
        customerRows.get(customer).push({ rowIndex, address, sales, division });
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
      const divisions = new Set(entries.map((entry) => entry.division));

      if (addresses.size > 1 || salesPeople.size > 1 || divisions.size > 1) {
        addIssue(
          `顧客「${customer}」の情報が複数行で一致していません。住所、担当営業、営業部門などの顧客属性が注文明細に混在しています。`,
          entries.flatMap((entry) => [
            makeCellKey(0, entry.rowIndex, 5),
            makeCellKey(0, entry.rowIndex, 6),
            makeCellKey(0, entry.rowIndex, 7)
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
        const division = row[7] ?? '';
        const product = row[1] ?? '';
        const price = row[2] ?? '';

        if (customer && !baselineCustomers.has(customer)) {
          baselineCustomers.set(customer, { address, sales, division });
        }
        if (product && !baselineProducts.has(product)) {
          baselineProducts.set(product, { price });
        }
      });

      baselineCustomers.forEach((info, customer) => {
        if (!customerRows.has(customer)) {
          addIssue(
            `削除の結果、顧客「${customer}」の注文行がすべて消え、住所「${info.address}」、担当営業「${info.sales}」、営業部門「${info.division}」もテーブルから失われました。顧客情報まで一緒に消える削除異常です。`
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
    const salesInfoMap = new Map();
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

      const prev = salesInfoMap.get(sales);
      if (prev && prev.dept !== dept) {
        addIssue(
          `担当営業「${sales}」の営業部門が顧客行ごとに一致していません。推移的従属による更新異常です。`,
          [
            makeCellKey(3, prev.rowIndex, 4),
            makeCellKey(3, rowIndex, 4)
          ]
        );
      } else if (!prev) {
        salesInfoMap.set(sales, { dept, rowIndex });
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

  if (stageId === 'bcnf') {
    const table = tables[0];
    const baselineTable = baselineTables?.[0];
    const repMap = new Map();
    const customerDayMap = new Map();
    const customerRepMap = new Map();

    table.rows.forEach((row, rowIndex) => {
      const customerId = row[0] ?? '';
      const day = row[1] ?? '';
      const repId = row[2] ?? '';

      if (!customerId || !day || !repId) {
        addIssue(
          `行${rowIndex + 1}: 顧客ID・訪問曜日・担当営業IDのいずれかが空です。この表では候補キーの組がそろわないと訪問割当を表せません。`,
          [
            makeCellKey(0, rowIndex, 0),
            makeCellKey(0, rowIndex, 1),
            makeCellKey(0, rowIndex, 2)
          ]
        );
      }

      if (customerId && day) {
        const key = `${customerId}::${day}`;
        if (!customerDayMap.has(key)) {
          customerDayMap.set(key, []);
        }
        customerDayMap.get(key).push(rowIndex);
      }

      if (customerId && repId) {
        const key = `${customerId}::${repId}`;
        if (!customerRepMap.has(key)) {
          customerRepMap.set(key, []);
        }
        customerRepMap.get(key).push(rowIndex);
      }

      if (!repId) {
        return;
      }

      if (!repMap.has(repId)) {
        repMap.set(repId, []);
      }
      repMap.get(repId).push({ rowIndex, day });
    });

    customerDayMap.forEach((rowIndices, key) => {
      if (rowIndices.length > 1) {
        const [customerId, day] = key.split('::');
        addIssue(
          `顧客ID「${customerId}」と訪問曜日「${day}」の組が重複しています。同じ候補キーを持つ行が重なっています。`,
          rowIndices.flatMap((rowIndex) => [
            makeCellKey(0, rowIndex, 0),
            makeCellKey(0, rowIndex, 1)
          ])
        );
      }
    });

    customerRepMap.forEach((rowIndices, key) => {
      if (rowIndices.length > 1) {
        const [customerId, repId] = key.split('::');
        addIssue(
          `顧客ID「${customerId}」と担当営業ID「${repId}」の組も重複しています。もう一方の候補キーでも同じ割当が二重に保存されています。`,
          rowIndices.flatMap((rowIndex) => [
            makeCellKey(0, rowIndex, 0),
            makeCellKey(0, rowIndex, 2)
          ])
        );
      }
    });

    repMap.forEach((entries, repId) => {
      const days = new Set(entries.map((entry) => entry.day));
      if (days.size > 1) {
        addIssue(
          `担当営業ID「${repId}」の訪問曜日が行ごとに一致していません。担当営業IDだけで訪問曜日が決まるのに、複数行で管理しているため更新異常が起きています。これは 3NF では残りえても、BCNF では分解したくなる形です。`,
          entries.flatMap((entry) => [
            makeCellKey(0, entry.rowIndex, 1),
            makeCellKey(0, entry.rowIndex, 2)
          ])
        );
      } else if (entries.length > 1) {
        addIssue(
          `担当営業ID「${repId}」の訪問曜日が複数行に繰り返し保存されています。担当営業ごとの曜日は 1 か所で管理したくなります。`,
          entries.flatMap((entry) => [
            makeCellKey(0, entry.rowIndex, 1),
            makeCellKey(0, entry.rowIndex, 2)
          ])
        );
      }
    });

    if (baselineTable) {
      const baselineReps = new Map();
      baselineTable.rows.forEach((row) => {
        const repId = row[2] ?? '';
        const day = row[1] ?? '';
        if (repId && !baselineReps.has(repId)) {
          baselineReps.set(repId, day);
        }
      });

      baselineReps.forEach((day, repId) => {
        if (!repMap.has(repId)) {
          addIssue(
            `削除の結果、担当営業ID「${repId}」に対応する行がすべて消え、訪問曜日「${day}」という事実も表から失われました。担当営業ごとの曜日情報まで一緒に消える削除異常です。`,
            [],
            [0]
          );
        }
      });
    }

    addIssue(
      'この表では、新しい担当営業の訪問曜日だけを独立して登録しづらくなります。顧客との割当行を作らないと、担当営業ごとの曜日ルールを置きにくい挿入の面倒さがあります。',
      [],
      [0]
    );
  }

  if (stageId === '4nf') {
    const table = tables[0];
    const baselineTable = baselineTables?.[0];
    const productMap = new Map();

    table.rows.forEach((row, rowIndex) => {
      const productId = row[0] ?? '';
      const supplier = row[1] ?? '';
      const channel = row[2] ?? '';

      if (!productId) {
        return;
      }

      if (!productMap.has(productId)) {
        productMap.set(productId, []);
      }
      productMap.get(productId).push({ rowIndex, supplier, channel });
    });

    productMap.forEach((entries, productId) => {
      const suppliers = [...new Set(entries.map((entry) => entry.supplier).filter(Boolean))];
      const channels = [...new Set(entries.map((entry) => entry.channel).filter(Boolean))];

      if (suppliers.length > 1 && channels.length > 1) {
        addIssue(
          `商品「${productId}」では、複数の仕入先と複数の販売チャネルが独立して存在しています。1表で持つと組合せの行が増え、追加や削除が面倒になります。`,
          entries.flatMap((entry) => [
            makeCellKey(0, entry.rowIndex, 1),
            makeCellKey(0, entry.rowIndex, 2)
          ])
        );
      }

      const pairSet = new Set(entries.map((entry) => `${entry.supplier}::${entry.channel}`));
      suppliers.forEach((supplier) => {
        channels.forEach((channel) => {
          if (!pairSet.has(`${supplier}::${channel}`)) {
            addIssue(
              `商品「${productId}」では、仕入先「${supplier}」と販売チャネル「${channel}」の組合せだけが欠けています。独立した事実を1表で管理すると、どの組合せを入れるべきか人が気にし続ける必要があります。`,
              entries.flatMap((entry) => [
                makeCellKey(0, entry.rowIndex, 0),
                makeCellKey(0, entry.rowIndex, 1),
                makeCellKey(0, entry.rowIndex, 2)
              ])
            );
          }
        });
      });
    });

    if (baselineTable) {
      const beforeByProduct = new Map();
      baselineTable.rows.forEach((row) => {
        const productId = row[0] ?? '';
        const supplier = row[1] ?? '';
        const channel = row[2] ?? '';
        if (!productId) {
          return;
        }
        if (!beforeByProduct.has(productId)) {
          beforeByProduct.set(productId, { suppliers: new Set(), channels: new Set() });
        }
        beforeByProduct.get(productId).suppliers.add(supplier);
        beforeByProduct.get(productId).channels.add(channel);
      });

      beforeByProduct.forEach((before, productId) => {
        const entries = productMap.get(productId) ?? [];
        const afterSuppliers = new Set(entries.map((entry) => entry.supplier));
        const afterChannels = new Set(entries.map((entry) => entry.channel));

        before.suppliers.forEach((supplier) => {
          if (!afterSuppliers.has(supplier)) {
            addIssue(
              `削除の結果、商品「${productId}」に対する仕入先「${supplier}」の事実が表から消えました。販売チャネルとの組合せ行に埋もれていたため、別の事実までまとめて失われやすくなります。`,
              [],
              [0]
            );
          }
        });

        before.channels.forEach((channel) => {
          if (!afterChannels.has(channel)) {
            addIssue(
              `削除の結果、商品「${productId}」に対する販売チャネル「${channel}」の事実が表から消えました。独立した多値事実が1表に混ざっているためです。`,
              [],
              [0]
            );
          }
        });
      });
    }

    addIssue(
      'この表では、新しい仕入先だけ、または新しい販売チャネルだけを気軽に追加できません。独立した事実なのに、既存の組合せ行を意識して何行も追加する必要があります。',
      [],
      [0]
    );
  }

  if (stageId === '5nf') {
    const table = tables[0];
    const tripleSet = new Set();
    const productStore = new Set();
    const storeCarrier = new Set();
    const productCarrier = new Set();
    const rows = [];

    table.rows.forEach((row, rowIndex) => {
      const product = row[0] ?? '';
      const store = row[1] ?? '';
      const carrier = row[2] ?? '';

      if (!product || !store || !carrier) {
        return;
      }

      tripleSet.add(`${product}::${store}::${carrier}`);
      productStore.add(`${product}::${store}`);
      storeCarrier.add(`${store}::${carrier}`);
      productCarrier.add(`${product}::${carrier}`);
      rows.push({ rowIndex, product, store, carrier });
    });

    rows.forEach(({ rowIndex, product, store, carrier }) => {
      addIssue(
        `行${rowIndex + 1}の三者組「${product} × ${store} × ${carrier}」には、商品と販売店、販売店と配送業者、商品と配送業者という3つの事実が同時に含まれています。1行の削除で何の事実を消したいのか曖昧になります。`,
        [
          makeCellKey(0, rowIndex, 0),
          makeCellKey(0, rowIndex, 1),
          makeCellKey(0, rowIndex, 2)
        ]
      );
    });

    productStore.forEach((ps) => {
      const [product, store] = ps.split('::');
      storeCarrier.forEach((sc) => {
        const [storeInSc, carrier] = sc.split('::');
        if (storeInSc !== store) {
          return;
        }
        if (!productCarrier.has(`${product}::${carrier}`)) {
          return;
        }
        const tripleKey = `${product}::${store}::${carrier}`;
        if (!tripleSet.has(tripleKey)) {
          addIssue(
            `商品「${product}」と販売店「${store}」、販売店「${store}」と配送業者「${carrier}」、商品「${product}」と配送業者「${carrier}」の二者関係はそろっています。三者組だけが欠けると、3項表を人手で保守している感覚が強くなります。`,
            [],
            [0]
          );
        }
      });
    });

    addIssue(
      'この段階では、三者組をそのまま管理するより、「商品-販売店」「販売店-配送業者」「商品-配送業者」の二者関係へ分けた方が、何の事実を追加・削除しているかが分かりやすくなります。',
      [],
      [0]
    );
  }

  return { issues, highlights };
}
