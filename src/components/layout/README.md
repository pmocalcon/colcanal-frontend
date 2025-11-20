# Layout Components

Este directorio contiene componentes de layout reutilizables para la aplicación.

## AppHeader

Componente de header que incluye los logos institucionales, información del usuario y navegación básica.

### Uso Básico

```tsx
import { AppHeader } from '@/components/layout/AppHeader';

function MyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <AppHeader />

      {/* Contenido de la página */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ... */}
      </main>
    </div>
  );
}
```

### Props

- `title` (opcional): Título principal del header (default: "Canalcongroup")
- `subtitle` (opcional): Subtítulo del header (default: "Sistema de Gestión Empresarial")
- `showBackButton` (opcional): Muestra botón de volver (default: false)
- `onBack` (opcional): Función personalizada para el botón de volver

### Ejemplos

#### Header Básico
```tsx
<AppHeader />
```

#### Header con Título Personalizado
```tsx
<AppHeader
  title="Gestión de Compras"
  subtitle="Requisiciones de Compra"
/>
```

#### Header con Botón de Volver
```tsx
<AppHeader
  title="Detalle de Requisición"
  showBackButton={true}
  onBack={() => navigate('/dashboard/requisiciones')}
/>
```

## Logos Institucionales

Los logos se encuentran en `/public/assets/images/`:
- `logo-canalco.png` - Logo de Canales Contactos (izquierda)
- `logo-alumbrado.png` - Logo de Alumbrado Público (derecha)

Estos logos se incluyen automáticamente en el componente AppHeader.

## Para Headers Personalizados

Si necesitas crear un header personalizado (sin usar AppHeader), asegúrate de incluir los logos:

```tsx
<header className="bg-white border-b shadow-sm">
  <div className="max-w-7xl mx-auto px-6 py-4">
    <div className="flex items-center justify-between gap-4">
      {/* Logo Izquierdo - Canales Contactos */}
      <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))]">
        <img
          src="/assets/images/logo-canalco.png"
          alt="Canales Contactos"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Contenido del centro */}
      <div className="flex-grow">
        {/* Tu contenido aquí */}
      </div>

      {/* Logo Derecho - Alumbrado Público */}
      <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))]">
        <img
          src="/assets/images/logo-alumbrado.png"
          alt="Alumbrado Público"
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  </div>
</header>
```

## Estándares de Diseño

- Los logos deben tener dimensiones: 16x16 en mobile (w-16 h-16) y 20x20 en desktop (md:w-20 md:h-20)
- Los logos deben usar `object-contain` para mantener proporciones
- Los contenedores de logos deben tener borde primario: `border-2 border-[hsl(var(--canalco-primary))]`
- Los logos deben tener sombra: `shadow-md`
- Los logos deben tener esquinas redondeadas: `rounded-xl`
