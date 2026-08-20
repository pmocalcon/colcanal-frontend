import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DashboardModulePage from './pages/DashboardModulePage'
import ComprasPage from './pages/ComprasPage'
import RequisicionesPage from './pages/RequisicionesPage'
import CrearRequisicionPage from './pages/CrearRequisicionPage'
import EditarRequisicionPage from './pages/EditarRequisicionPage'
import RevisarRequisicionesPage from './pages/RevisarRequisicionesPage'
import AutorizarRequisicionesPage from './pages/AutorizarRequisicionesPage'
import ValidarRequisicionesPage from './pages/ValidarRequisicionesPage'
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
import AdminUsuariosPage from './pages/AdminUsuariosPage'
import CrearUsuarioPage from './pages/CrearUsuarioPage'
import DetalleUsuarioPage from './pages/DetalleUsuarioPage'
import ProveedoresPage from './pages/ProveedoresPage'
import CrearObraPage from './pages/CrearObraPage'
import LevantamientoObrasPage from './pages/LevantamientoObrasPage'
import ObrasListPage from './pages/ObrasListPage'
import LevantamientosListPage from './pages/LevantamientosListPage'
import RevisarLevantamientoDetallePage from './pages/RevisarLevantamientoDetallePage'
import GestionarUcapsPage from './pages/GestionarUcapsPage'
import PresupuestoPage from './pages/PresupuestoPage'
import PresupuestosListPage from './pages/PresupuestosListPage'
import PlanAnualPage from './pages/PlanAnualPage'
import ActasProvisionalesPage from './pages/ActasProvisionalesPage'
import AprobacionesPage from './pages/AprobacionesPage'
import ResumenPlanAnualPage from './pages/ResumenPlanAnualPage'
import ResumenActaPage from './pages/ResumenActaPage'
import RevisarCantidadesActaPage from './pages/RevisarCantidadesActaPage'
import CronogramaPage from './pages/CronogramaPage'
import NotificacionesPage from './pages/NotificacionesPage'
import CregHomePage from './pages/CregHomePage'
import CregPage from './pages/CregPage'
import CregResumenPage from './pages/CregResumenPage'
import CregComparadorPage from './pages/CregComparadorPage'
import CregParametrosPage from './pages/CregParametrosPage'
import CregIppPage from './pages/CregIppPage'
import CregCensoPage from './pages/CregCensoPage'
import CregLiquidacionPage from './pages/CregLiquidacionPage'
import CregFlujoCajaPage from './pages/CregFlujoCajaPage'
import CregIddOffPage from './pages/CregIddOffPage'
import CregIddOnPage from './pages/CregIddOnPage'
import CregUnitFormPage from './pages/CregUnitFormPage'
import CregFacturaEnergiaPage from './pages/CregFacturaEnergiaPage'
import GestionConocimientoPage from './pages/GestionConocimientoPage'
import RecursoEconomicoHomePage from './pages/RecursoEconomicoHomePage'
import RecursoEconomicoPage from './pages/RecursoEconomicoPage'
import FacturaConcesionPage from './pages/FacturaConcesionPage'
import SolicitudesJuridicaListPage from './pages/SolicitudesJuridicaListPage'
import SolicitudPrestacionServiciosPage from './pages/SolicitudPrestacionServiciosPage'
import ChecklistContratoPage from './pages/ChecklistContratoPage'
import RequisicionPersonalPage from './pages/RequisicionPersonalPage'
import { LayoutSistema } from './components/layout/LayoutSistema'
import DesignacionSupervisorPage from './pages/DesignacionSupervisorPage'
import VerificacionGarantiasPage from './pages/VerificacionGarantiasPage'
import AprobacionGarantiasPage from './pages/AprobacionGarantiasPage'
import GestionFormatosHomePage from './pages/GestionFormatosHomePage'
import FormatoListPage from './pages/FormatoListPage'
import ActaTerminacionPage from './pages/ActaTerminacionPage'
import ContestacionTutelaPage from './pages/ContestacionTutelaPage'
import SolicitudPrestamoPage from './pages/SolicitudPrestamoPage'
import SolicitudPermisoPage from './pages/SolicitudPermisoPage'
import SolicitudVacacionesPage from './pages/SolicitudVacacionesPage'
import HorasExtrasPage from './pages/HorasExtrasPage'
import TalentoHumanoHomePage from './pages/TalentoHumanoHomePage'
import PersonalListPage from './pages/PersonalListPage'
import PrestamosListPage from './pages/PrestamosListPage'
import IncapacidadesPage from './pages/IncapacidadesPage'
import AusentismosPage from './pages/AusentismosPage'
import ActaInicioPage from './pages/ActaInicioPage'
import OtrosiPage from './pages/OtrosiPage'
import ContratoPage from './pages/ContratoPage'
import MatrizContratosPage from './pages/MatrizContratosPage'
import ContableHomePage from './pages/ContableHomePage'
import CuentasCompaniasPage from './pages/CuentasCompaniasPage'
import SolicitudesContableListPage from './pages/SolicitudesContableListPage'
import SolicitudAnticipoPage from './pages/SolicitudAnticipoPage'
import LegalizacionAnticipoPage from './pages/LegalizacionAnticipoPage'
import { ProtectedRoute } from './components/ProtectedRoute'

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <LayoutSistema>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/dashboard" element={<DashboardModulePage />} />
          <Route path="/dashboard/compras" element={<ComprasPage />} />
          <Route path="/dashboard/compras/requisiciones" element={<RequisicionesPage />} />
          <Route path="/dashboard/compras/requisiciones/crear" element={<CrearRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/editar/:id" element={<EditarRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/detalle/:id" element={<DetalleRequisicionPage />} />
          <Route path="/dashboard/compras/requisiciones/revisar" element={<RevisarRequisicionesPage />} />
          <Route path="/dashboard/compras/requisiciones/autorizar" element={<AutorizarRequisicionesPage />} />
          <Route path="/dashboard/compras/requisiciones/validar" element={<ValidarRequisicionesPage />} />
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
          {/* Administración de Usuarios */}
          <Route path="/dashboard/usuarios" element={<AdminUsuariosPage />} />
          <Route path="/dashboard/usuarios/crear" element={<CrearUsuarioPage />} />
          <Route path="/dashboard/usuarios/:id" element={<DetalleUsuarioPage />} />
          {/* Proveedores */}
          <Route path="/dashboard/proveedores" element={<ProveedoresPage />} />
          {/* Levantamiento de Obras */}
          {/* Bandeja unica de Gerencia. El PMO entra por su condicion de comodin. */}
          <Route
            path="/dashboard/aprobaciones"
            element={
              <ProtectedRoute allowedRoles={['Gerencia', 'Analista PMO', 'Director PMO']}>
                <AprobacionesPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/levantamiento-obras" element={<LevantamientoObrasPage />} />
          <Route path="/dashboard/levantamiento-obras/obras" element={<ObrasListPage />} />
          <Route
            path="/dashboard/levantamiento-obras/obras/crear"
            element={
              <ProtectedRoute permission={['levantamientos:crear', 'levantamientos:nueva-obra']} allowedRoles="Director Técnico">
                <CrearObraPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/levantamiento-obras/obras/editar/:id"
            element={
              <ProtectedRoute permission={['levantamientos:editar', 'levantamientos:nueva-obra']} allowedRoles="Director Técnico">
                <CrearObraPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/levantamiento-obras/levantamientos" element={<LevantamientosListPage />} />
          <Route
            path="/dashboard/levantamiento-obras/levantamientos/revisar/:surveyId"
            element={
              <ProtectedRoute permission="levantamientos:revisar">
                <RevisarLevantamientoDetallePage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/levantamiento-obras/ucaps" element={<GestionarUcapsPage />} />
          <Route path="/dashboard/levantamiento-obras/presupuesto" element={<PresupuestoPage />} />
          <Route path="/dashboard/levantamiento-obras/presupuesto/:id" element={<PresupuestoPage />} />
          <Route path="/dashboard/levantamiento-obras/presupuestos" element={<PresupuestosListPage />} />
          {/* Gerencia de Proyectos arma el acta provisional, Gerencia autoriza la compra
              y la Dirección Financiera entra solo al control de las que siguen sin código. */}
          <Route
            path="/dashboard/levantamiento-obras/actas-provisionales"
            element={
              <ProtectedRoute
                permission={['levantamientos:autorizar', 'levantamientos:aprobar']}
                allowedRoles={[
                  'Gerencia de Proyectos',
                  'Gerencia',
                  'Director Financiero y Administrativo',
                ]}
              >
                <ActasProvisionalesPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/levantamiento-obras/plan-anual" element={<PlanAnualPage />} />
          <Route path="/dashboard/levantamiento-obras/plan-anual/resumen" element={<ResumenPlanAnualPage />} />
          <Route
            path="/dashboard/levantamiento-obras/cronograma"
            element={
              <ProtectedRoute permission="levantamientos:cronograma" allowedRoles={['Super Admin', 'Analista PMO', 'Director PMO']}>
                <CronogramaPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/levantamiento-obras/acta/:recordNumber" element={<ResumenActaPage />} />
          <Route path="/dashboard/levantamiento-obras/acta/:recordNumber/cantidades" element={<RevisarCantidadesActaPage />} />
          <Route path="/dashboard/notificaciones" element={<NotificacionesPage />} />
          <Route
            path="/dashboard/creg"
            element={
              <ProtectedRoute permission="creg:ver">
                <CregHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/unidades"
            element={
              <ProtectedRoute permission="creg:unidades">
                <CregPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/resumen"
            element={
              <ProtectedRoute permission="creg:resumen">
                <CregResumenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/comparador"
            element={
              <ProtectedRoute permission="creg:resumen">
                <CregComparadorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/parametros"
            element={
              <ProtectedRoute permission="creg:parametros">
                <CregParametrosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/ipp"
            element={
              <ProtectedRoute permission="creg:parametros">
                <CregIppPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/censo"
            element={
              <ProtectedRoute permission="creg:censo">
                <CregCensoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/liquidacion"
            element={
              <ProtectedRoute permission="creg:liquidacion">
                <CregLiquidacionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/flujo-caja"
            element={
              <ProtectedRoute permission="creg:liquidacion">
                <CregFlujoCajaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/factura-energia"
            element={
              <ProtectedRoute permission="creg:liquidacion">
                <CregFacturaEnergiaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/idd-off"
            element={
              <ProtectedRoute permission="creg:iddoff">
                <CregIddOffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/idd-on"
            element={
              <ProtectedRoute permission="creg:iddon">
                <CregIddOnPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/creg/unidad/:id"
            element={
              <ProtectedRoute permission="creg:unidades">
                <CregUnitFormPage />
              </ProtectedRoute>
            }
          />
          {/* Gestión del conocimiento */}
          {/* Talento Humano: modulo propio. No confundir con G. de talento humano, que
              esta dentro de Gestion del conocimiento y es donde se diligencian los formatos. */}
          <Route path="/dashboard/talento-humano" element={<TalentoHumanoHomePage />} />
          <Route path="/dashboard/talento-humano/personal" element={<PersonalListPage />} />
          <Route path="/dashboard/talento-humano/prestamos" element={<PrestamosListPage />} />
          <Route path="/dashboard/talento-humano/incapacidades" element={<IncapacidadesPage />} />
          <Route path="/dashboard/talento-humano/ausentismos" element={<AusentismosPage />} />
          <Route path="/dashboard/gestion-conocimiento" element={<GestionConocimientoPage />} />
          {/* La gestión abre en su portada de formatos; el trámite de contratación pasa a
              vivir bajo /contratos. Los segmentos fijos ganan sobre /:id (React Router los
              ordena por especificidad), igual que ya pasaba con /matriz. */}
          <Route path="/dashboard/gestion-conocimiento/juridica" element={<GestionFormatosHomePage gestion="juridica" />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/contratos" element={<SolicitudesJuridicaListPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/terminacion" element={<FormatoListPage gestion="juridica" slug="terminacion" />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/terminacion/:id" element={<ActaTerminacionPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/tutela" element={<FormatoListPage gestion="juridica" slug="tutela" />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/tutela/:id" element={<ContestacionTutelaPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/nueva" element={<SolicitudPrestacionServiciosPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id" element={<SolicitudPrestacionServiciosPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/requisicion-personal" element={<RequisicionPersonalPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/chequeo" element={<ChecklistContratoPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/verificacion-garantias" element={<VerificacionGarantiasPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/aprobacion-garantias" element={<AprobacionGarantiasPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/designacion-supervisor" element={<DesignacionSupervisorPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/contrato" element={<ContratoPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/acta-inicio" element={<ActaInicioPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/:id/otrosi" element={<OtrosiPage />} />
          <Route path="/dashboard/gestion-conocimiento/juridica/matriz" element={<MatrizContratosPage />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano" element={<GestionFormatosHomePage gestion="talento-humano" />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/prestamo" element={<FormatoListPage gestion="talento-humano" slug="prestamo" />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/prestamo/:id" element={<SolicitudPrestamoPage />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/permiso" element={<FormatoListPage gestion="talento-humano" slug="permiso" />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/permiso/:id" element={<SolicitudPermisoPage />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/vacaciones" element={<FormatoListPage gestion="talento-humano" slug="vacaciones" />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/vacaciones/:id" element={<SolicitudVacacionesPage />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/horas-extras" element={<FormatoListPage gestion="talento-humano" slug="horas-extras" />} />
          <Route path="/dashboard/gestion-conocimiento/talento-humano/horas-extras/:id" element={<HorasExtrasPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable" element={<ContableHomePage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/anticipos" element={<SolicitudesContableListPage tipo="anticipos" />} />
          <Route path="/dashboard/gestion-conocimiento/contable/legalizaciones" element={<SolicitudesContableListPage tipo="legalizaciones" />} />
          <Route path="/dashboard/gestion-conocimiento/contable/anticipo/nueva" element={<SolicitudAnticipoPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/anticipo/:id" element={<SolicitudAnticipoPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/legalizacion/nueva" element={<LegalizacionAnticipoPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/legalizacion/:id" element={<LegalizacionAnticipoPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/cuentas-companias" element={<SolicitudesContableListPage tipo="cuentas-companias" />} />
          <Route path="/dashboard/gestion-conocimiento/contable/cuentas-companias/nueva" element={<CuentasCompaniasPage />} />
          <Route path="/dashboard/gestion-conocimiento/contable/cuentas-companias/:id" element={<CuentasCompaniasPage />} />
          {/* Recurso Económico: solo PMO. La página repite la verificación de rol
              y el backend la cierra con RolesGuard. */}
          <Route path="/dashboard/recurso-economico" element={<RecursoEconomicoHomePage />} />
          <Route path="/dashboard/recurso-economico/parametros" element={<RecursoEconomicoPage />} />
          <Route path="/dashboard/recurso-economico/factura" element={<FacturaConcesionPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </LayoutSistema>
      </BrowserRouter>
    </AuthProvider>
  )
}
