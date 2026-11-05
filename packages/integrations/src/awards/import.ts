import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { AwardRow } from '@district/contracts/awards/types';

export async function parseAwardsFile(bytes: Buffer, filename: string): Promise<AwardRow[]> {
  if (bytes.length > 2 * 1024 * 1024) throw new TypeError('File must be smaller than 2 MB');
  const workbook = new ExcelJS.Workbook();

  if (/\.csv$/i.test(filename)) await workbook.csv.read(Readable.from([bytes]), { map: value => value });
  else if (/\.xlsx$/i.test(filename)) await workbook.xlsx.read(Readable.from([bytes]));
  else throw new TypeError('Choose a CSV or .xlsx Excel file');
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 2) throw new TypeError('The first sheet must contain headers and awards');

  if (sheet.rowCount > 501) throw new TypeError('Import up to 500 awards at a time');
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, index) => columns.set(cell.text.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[_\s]+/g, ' '), index));
  const required = ['membership number', 'award description', 'award date'];

  if (required.some(key => !columns.has(key))) throw new TypeError('Required columns: Membership number, Award description, Award date');
  const awards: AwardRow[] = [];
  const seen = new Set<string>();

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);

    if (!row.hasValues) continue;
    const cells = required.map(key => row.getCell(columns.get(key)!));

    if (cells.some(cell => cell.type === ExcelJS.ValueType.Formula)) throw new TypeError(`Row ${i}: formulas are not supported`);
    const membershipNumber = cells[0]!.text.trim().replace(/^0+(?=\d)/, '');
    const description = cells[1]!.text.trim();
    const value = cells[2]!.value;
    let awardDate = value instanceof Date ? value.toISOString().slice(0, 10) : cells[2]!.text.trim();
    const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(awardDate);

    if (uk) awardDate = `${uk[3]}-${uk[2]}-${uk[1]}`;

    if (!/^[1-9]\d*$/.test(membershipNumber) || !Number.isSafeInteger(Number(membershipNumber))) throw new TypeError(`Row ${i}: invalid membership number`);

    if (!description || description.length > 500) throw new TypeError(`Row ${i}: award description must contain 1–500 characters`);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(awardDate) || !Number.isFinite(Date.parse(awardDate)) || new Date(awardDate).toISOString().slice(0, 10) !== awardDate) throw new TypeError(`Row ${i}: use a valid date (YYYY-MM-DD or DD/MM/YYYY)`);
    const award = { membershipNumber, description, awardDate };
    const key = JSON.stringify(award);

    if (seen.has(key)) throw new TypeError(`Row ${i}: duplicate award`);
    seen.add(key); awards.push({ ...award, sourceRow: i });
  }

  if (!awards.length) throw new TypeError('No awards found');

  return awards;
}
