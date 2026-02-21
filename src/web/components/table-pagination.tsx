import { Button } from "@web/components/ui/button";

interface TablePaginationProps {
  onPageChange: (page: number) => void;
  page: number;
  perPage: number;
  total: number;
}

export function TablePagination({
  page,
  perPage,
  total,
  onPageChange,
}: TablePaginationProps) {
  const totalPages = Math.ceil(total / perPage);

  if (total <= perPage) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground text-sm">
        {total} entries &mdash; Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={(page + 1) * perPage >= total}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
