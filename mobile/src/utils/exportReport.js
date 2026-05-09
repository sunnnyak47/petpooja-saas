import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

/**
 * Generate an HTML report and export as PDF
 * @param {Object} opts
 * @param {string} opts.title - Report title
 * @param {string} opts.subtitle - Date range or subtitle
 * @param {string} opts.outletName - Outlet name
 * @param {Array} opts.sections - Array of { heading, rows: [{ label, value }] }
 * @param {Array} opts.tableData - Optional { headers: string[], rows: string[][] }
 */
export async function exportReportPdf({ title, subtitle, outletName, sections = [], tableData }) {
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const sectionHtml = sections.map(sec => `
    <div class="section">
      <h3>${sec.heading}</h3>
      ${sec.rows.map(r => `
        <div class="row">
          <span class="label">${r.label}</span>
          <span class="value">${r.value}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  const tableHtml = tableData ? `
    <div class="section">
      <h3>${tableData.title || 'Details'}</h3>
      <table>
        <thead><tr>${tableData.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${tableData.rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  ` : '';

  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, 'Helvetica Neue', sans-serif; padding: 40px; color: #000; }
        .header { border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 24px; font-weight: 800; }
        .header h2 { font-size: 14px; color: #666; margin-top: 4px; }
        .header .meta { font-size: 11px; color: #999; margin-top: 8px; }
        .section { margin-bottom: 24px; }
        .section h3 { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
        .label { font-size: 13px; color: #444; }
        .value { font-size: 13px; font-weight: 600; color: #000; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 8px 6px; background: #f5f5f5; font-weight: 700; border-bottom: 2px solid #ddd; }
        td { padding: 8px 6px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #bbb; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
        <h2>${subtitle}</h2>
        <div class="meta">${outletName} • Generated: ${now}</div>
      </div>
      ${sectionHtml}
      ${tableHtml}
      <div class="footer">PetPooja Owner App • Confidential Report</div>
    </body>
    </html>
  `;

  // Generate PDF
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });

  // Rename to something meaningful
  const filename = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const newUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.moveAsync({ from: uri, to: newUri });

  return newUri;
}

/**
 * Share a file using the system share sheet
 */
export async function shareFile(fileUri, dialogTitle = 'Share Report') {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/pdf',
    dialogTitle,
    UTI: 'com.adobe.pdf',
  });
}
