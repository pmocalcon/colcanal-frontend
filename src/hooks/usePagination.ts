import { useState, useMemo } from 'react';

interface UsePaginationResult<T> {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  paginatedItems: T[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToPage: (page: number) => void;
}

/**
 * Hook genérico para manejar paginación local
 * @param items - Array de items a paginar
 * @param itemsPerPage - Número de items por página (default: 10)
 */
export function usePagination<T>(items: T[], itemsPerPage = 10): UsePaginationResult<T> {
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(items.length / itemsPerPage));
  }, [items.length, itemsPerPage]);

  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [items, page, itemsPerPage]);

  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const goToNextPage = () => {
    if (hasNextPage) {
      setPage((p) => p + 1);
    }
  };

  const goToPrevPage = () => {
    if (hasPrevPage) {
      setPage((p) => p - 1);
    }
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return {
    page,
    setPage,
    totalPages,
    paginatedItems,
    hasNextPage,
    hasPrevPage,
    goToNextPage,
    goToPrevPage,
    goToPage,
  };
}
