import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Admin } from "./pages/Admin.jsx";
import { Home } from "./pages/Home.jsx";
import { ShopProvider } from "./shop-context.jsx";

export function App() {
  return (
    <ShopProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </ShopProvider>
  );
}
