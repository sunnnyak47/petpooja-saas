// Mock expo modules
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file:///tmp/test.pdf' }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  moveAsync: jest.fn().mockResolvedValue(undefined),
}));

import { exportReportPdf, shareFile } from '../src/utils/exportReport';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

describe('exportReportPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generates PDF with correct title', async () => {
    const uri = await exportReportPdf({
      title: 'Sales Report',
      subtitle: 'Today',
      outletName: 'Test Outlet',
      sections: [
        { heading: 'Summary', rows: [{ label: 'Revenue', value: '₹1000' }] },
      ],
    });

    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ width: 612, height: 792 })
    );
    expect(FileSystem.moveAsync).toHaveBeenCalled();
    expect(uri).toContain('Sales_Report');
  });

  test('handles table data', async () => {
    await exportReportPdf({
      title: 'Test',
      subtitle: 'Sub',
      outletName: 'Outlet',
      tableData: {
        title: 'Items',
        headers: ['Name', 'Qty'],
        rows: [['Pizza', '10']],
      },
    });

    const htmlArg = Print.printToFileAsync.mock.calls[0][0].html;
    expect(htmlArg).toContain('Items');
    expect(htmlArg).toContain('Pizza');
  });
});

describe('shareFile', () => {
  test('calls sharing with PDF mime type', async () => {
    await shareFile('file:///test.pdf', 'Share Test');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///test.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' })
    );
  });
});
