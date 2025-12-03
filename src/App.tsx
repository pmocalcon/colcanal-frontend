import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ComprasPage from './pages/ComprasPage'
import RequisicionesPage from './pages/RequisicionesPage'
import CrearRequisicionPage from './pages/CrearRequisicionPage'
import EditarRequisicionPage from './pages/EditarRequisicionPage'
import RevisarRequisicionesPage from './pages/RevisarRequisicionesPage'
import AutorizarRequisicionesPage from './pages/AutorizarRequisicionesPage'
import DetalleRequisicionPage from './pages/DetalleRequisicionPage'
import CotizacionesPage from './pages/CotizacionesPage'
import GestionarCotizacionPage from './pages/GestionarCotizacionPage'
import OrdenesDeCompraPage from './pages/OrdenesDeCompraPage'
import AsignarPreciosPage from './pages/AsignarPreciosPage'
import RecepcionesPage from './pages/RecepcionesPage'
import RegistrarRecepcionPage from './pages/RegistrarRecepcionPage'
import AuditoriasPage from './pages/AuditoriasPage'
import AuditoriasComprasPage from './pages/AuditoriasComprasPage'
import AuditoriasComprasDetallePage from './pages/AuditoriasComprasDetallePage'
import AprobarOrdenesCompraPage from './pages/AprobarOrdenesCompraPage'
import GestionFacturasPage from './pages/GestionFacturasPage'
import FacturasOrdenCompraPage from './pages/FacturasOrdenCompraPage'
import RecepcionContabilidadPage from './pages/RecepcionContabilidadPage'
import SolicitudCotizacionProveedorPage from './pages/SolicitudCotizacionProveedorPage'
import VerOrdenCompraPage from './pages/VerOrdenCompraPage'
import VerOrdenCompraIndividualPage from './pages/VerOrdenCompraIndividualPage'
import MaterialesPage from './pages/MaterialesPage'
import GruposMaterialesPage from './pages/GruposMaterialesPage'
import MaterialesListPage from './pages/MaterialesListPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/compras" element={<ComprasPage />} />
          <Route path="/dashboard/compras/requisiciones" element={<RequisicionesPage />} />
          <Route path="/dashboard/compras/requisiciones/crear" element={<CrearRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/editar/:id" element={<EditarRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/detalle/:id" element={<DetalleRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/revisar" element={<RevisarRequisicionesPage />} />
          <Route path="/dashboard/compras/requisiciones/autorizar" element={<AutorizarRequisicionesPage />} />
          <Route path="/dashboard/compras/ordenes-compra/aprobar" element={<AprobarOrdenesCompraPage />} />
          <Route path="/dashboard/compras/cotizaciones" element={<CotizacionesPage />} />
          <Route path="/dashboard/compras/cotizaciones/gestionar/:requisitionId" element={<GestionarCotizacionPage />} />
          <Route
            path="/dashboard/compras/cotizaciones/solicitud/:requisitionId/proveedor/:supplierId"
            element={<SolicitudCotizacionProveedorPage />}
          />
          <Route path="/dashboard/compras/ordenes" element={<OrdenesDeCompraPage />} />
          <Route path="/dashboard/compras/ordenes/:requisitionId/ver" element={<VerOrdenCompraPage />} />
          <Route path="/dashboard/compras/orden/:purchaseOrderId" element={<VerOrdenCompraIndividualPage />} />
          <Route path="/dashboard/compras/ordenes/:requisitionId/asignar-precios" element={<AsignarPreciosPage />} />
          <Route path="/dashboard/compras/recepciones" element={<RecepcionesPage />} />
          <Route path="/dashboard/compras/recepciones/:id/registrar" element={<RegistrarRecepcionPage />} />
          <Route path="/dashboard/compras/facturas" element={<GestionFacturasPage />} />
          <Route path="/dashboard/compras/facturas/:purchaseOrderId" element={<FacturasOrdenCompraPage />} />
          <Route path="/dashboard/compras/recepcion-contabilidad" element={<RecepcionContabilidadPage />} />
          <Route path="/dashboard/auditorias" element={<AuditoriasPage />} />
          <Route path="/dashboard/auditorias/compras" element={<AuditoriasComprasPage />} />
          <Route path="/dashboard/auditorias/compras/detalle/:requisitionId" element={<AuditoriasComprasDetallePage />} />
          {/* Materiales */}
          <Route path="/dashboard/materiales" element={<MaterialesPage />} />
          <Route path="/dashboard/materiales/grupos" element={<GruposMaterialesPage />} />
          <Route path="/dashboard/materiales/lista" element={<MaterialesListPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
