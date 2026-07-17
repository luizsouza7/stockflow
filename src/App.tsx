import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alerts } from './pages/Alerts';
import { Dashboard } from './pages/Dashboard';
import { Movements } from './pages/Movements';
import { ProductForm } from './pages/ProductForm';
import { Products } from './pages/Products';
import { Categories } from './pages/Categories';
import { DataExport } from './pages/DataExport';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'produtos', element: <Products /> },
      { path: 'produtos/novo', element: <ProductForm /> },
      { path: 'produtos/:id/editar', element: <ProductForm /> },
      { path: 'categorias', element: <Categories /> },
      { path: 'movimentacoes', element: <Movements /> },
      { path: 'alertas', element: <Alerts /> },
      { path: 'dados', element: <DataExport /> },
      {
        path: 'conta',
        lazy: async () => ({ Component: (await import('./pages/Account')).Account }),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
