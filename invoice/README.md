# Счёт-фактура «Электрик·Маркет»

PDF формата A4 из JSON-заказа. Нужен Node.js 18 или новее. Кириллица берётся из шрифтов Roboto в папке `fonts/`.

```bash
npm install
node src/generateInvoice.js data/order.json
```

Файл появится в `output/`. Для заказа `СФ-0001` это `output/invoice-СФ-0001.pdf`.
