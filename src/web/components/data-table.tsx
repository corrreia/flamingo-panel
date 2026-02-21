import { Card } from "@web/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";

export interface DataTableColumn<T> {
  accessorKey?: keyof T;
  align?: "left" | "right";
  cell?: (row: T) => React.ReactNode;
  className?: string;
  header: string;
  /** Hide this column on mobile (below md breakpoint) in desktop table view */
  hideOnMobile?: boolean;
  /** Show this field in mobile card view. Defaults to true. */
  showInMobileCard?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string | number;
}

function renderCellValue<T>(col: DataTableColumn<T>, row: T): React.ReactNode {
  if (col.cell) {
    return col.cell(row);
  }
  if (col.accessorKey) {
    return String(row[col.accessorKey] ?? "");
  }
  return null;
}

export function DataTable<T>({
  columns,
  data,
  emptyState,
  onRowClick,
  rowKey,
}: DataTableProps<T>) {
  if (!data?.length && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  className={`${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}
                  key={col.header}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((row) => (
              <TableRow
                className={onRowClick ? "cursor-pointer" : ""}
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell
                    className={`${col.align === "right" ? "text-right" : ""} ${col.className || ""}`}
                    key={col.header}
                  >
                    {renderCellValue(col, row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {data?.map((row) => (
          <Card
            className={
              onRowClick
                ? "cursor-pointer transition-colors hover:border-primary/50"
                : ""
            }
            key={rowKey(row)}
            onClick={() => onRowClick?.(row)}
          >
            <div className="space-y-2 p-4">
              {columns
                .filter((col) => col.showInMobileCard !== false)
                .map((col) => (
                  <div
                    className="flex items-start justify-between gap-2"
                    key={col.header}
                  >
                    <span className="text-muted-foreground text-xs">
                      {col.header}
                    </span>
                    <span className="text-right text-sm">
                      {renderCellValue(col, row)}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
