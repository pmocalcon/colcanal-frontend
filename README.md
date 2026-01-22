# CANALCO - Sistema de Gestión

Frontend del sistema de gestión empresarial CANALCO, construido con React, TypeScript y Vite.

## Tecnologías

- **React 19** - Biblioteca de UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool y dev server
- **Tailwind CSS** - Estilos utilitarios
- **Radix UI** - Componentes accesibles
- **React Router** - Enrutamiento
- **React Hook Form + Zod** - Formularios y validación
- **Axios** - Cliente HTTP
- **Lucide React** - Iconos

## Módulos

### Requisiciones
- Crear, editar y gestionar requisiciones de materiales
- Flujo de aprobación multi-nivel (Validación → Revisión → Autorización → Aprobación)
- Firmas digitales de aprobadores

### Compras
- Gestión de cotizaciones con múltiples proveedores
- Asignación de precios y generación de órdenes de compra
- Fecha estimada de entrega por proveedor
- Aprobación de órdenes de compra por Gerencia

### Recepciones
- Registro de recepciones parciales y totales
- Seguimiento de entregas pendientes

### Levantamiento de Obras
- Gestión de obras y proyectos
- Encuestas y UCAPs

## Scripts

```bash
# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview

# Linting
npm run lint
```

## Estructura del Proyecto

```
src/
├── components/     # Componentes reutilizables (UI)
├── contexts/       # Contextos de React (Auth, etc.)
├── pages/          # Páginas/vistas de la aplicación
├── services/       # Servicios API (axios)
├── types/          # Tipos TypeScript
└── utils/          # Utilidades y helpers
```

## Variables de Entorno

```env
VITE_API_URL=https://api.example.com
```

## Despliegue

El proyecto está configurado para desplegarse en **Vercel** con soporte para React Router (ver `vercel.json`).

## Desarrollo

1. Clonar el repositorio
2. Instalar dependencias: `npm install`
3. Configurar variables de entorno (`.env`)
4. Ejecutar en desarrollo: `npm run dev`
