import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, errorMessage } from './api';
const Catalog = createContext<{
  categories: string[];
  refresh: () => Promise<void>;
  error: string;
  loading: boolean;
}>({ categories: [], refresh: async () => {}, error:'', loading:false });
export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  async function refresh() {
    setLoading(true);setError('');
    try {
    const data = await api<{ items: { name: string }[] }>('/categories');
    setCategories(data.items.map((item) => item.name));
    } catch (issue) {setError(errorMessage(issue));throw issue;} finally {setLoading(false); }
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);
  return (
    <Catalog.Provider value={{ categories, refresh, error, loading }}>
      {children}
    </Catalog.Provider>
  );
}
export const useCategories = () => useContext(Catalog);
