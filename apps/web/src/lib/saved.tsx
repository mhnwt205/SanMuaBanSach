import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Book } from './types';

type SavedState = {
  books: Book[];
  toggle: (book: Book) => void;
  has: (id: string) => boolean;
};
const Saved = createContext<SavedState | null>(null);
const key = 'cho-sach-saved-v1';
export function SavedProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(data)
        ? data
            .filter(
              (book) =>
                typeof book?.id === 'string' &&
                typeof book.title === 'string' &&
                Number.isFinite(book.price),
            )
            .slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  function toggle(book: Book) {
    setBooks((current) => {
      const next = current.some((item) => item.id === book.id)
        ? current.filter((item) => item.id !== book.id)
        : [book, ...current].slice(0, 100);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Browsing still works if storage is unavailable. */
      }
      return next;
    });
  }
  return (
    <Saved.Provider
      value={{
        books,
        toggle,
        has: (id) => books.some((book) => book.id === id),
      }}
    >
      {children}
    </Saved.Provider>
  );
}
export function useSaved() {
  const state = useContext(Saved);
  if (!state) throw new Error('SavedProvider is required');
  return state;
}
