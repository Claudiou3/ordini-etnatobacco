declare module "xlsx-populate" {
  export type CellValue = string | number | boolean | Date | null;

  export class Cell {
    value(): CellValue;
    value(value: CellValue): Cell;
    formula(): string | null;
    formula(formula: string): Cell;
    style(name: string): unknown;
    style(name: string, value: unknown): Cell;
    rowNumber(): number;
    columnNumber(): number;
  }

  export class CellAddress {
    rowNumber(): number;
    columnNumber(): number;
  }

  export class Range {
    value(): CellValue[][];
    startCell(): Cell;
    endCell(): Cell;
  }

  export class Sheet {
    name(): string;
    cell(row: number, column: number): Cell;
    usedRange(): Range;
  }

  export class Workbook {
    sheet(index: number): Sheet;
    sheets(): Sheet[];
    toFileAsync(path: string): Promise<void>;
    outputAsync(): Promise<Buffer>;
  }

  export function fromFileAsync(path: string): Promise<Workbook>;
  export function fromDataAsync(
    data: Buffer | ArrayBuffer | Uint8Array
  ): Promise<Workbook>;

  const XLSXPopulate: {
    fromFileAsync: typeof fromFileAsync;
    fromDataAsync: typeof fromDataAsync;
  };

  export default XLSXPopulate;
}
