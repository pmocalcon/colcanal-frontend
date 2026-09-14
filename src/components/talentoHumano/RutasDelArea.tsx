import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { soloSolicitudesPago } from '@/services/talentoHumano.service';

/**
 * Envuelve las pantallas de Talento Humano que son del área.
 *
 * Quien entra al módulo solo por Solicitudes de pago no tiene tarjeta ni enlace hacia
 * ellas, pero puede teclear la dirección. El servidor ya le niega los datos; esto evita
 * que llegue a una pantalla armada a medias, llena de avisos de error, y lo lleva a la
 * única que es suya.
 */
export function RutasDelArea() {
  const { user } = useAuth();
  if (soloSolicitudesPago(user?.nombreRol, user?.nombre)) {
    return <Navigate to="/dashboard/talento-humano/pagos" replace />;
  }
  return <Outlet />;
}
