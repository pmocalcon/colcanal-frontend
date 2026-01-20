# 🚨 URGENTE: Backend está bloqueando usuarios con permisos válidos

**Fecha**: 2026-01-20
**Severidad**: CRÍTICA
**Afecta**: Todos los usuarios PQRS en producción

---

## 🔴 Problema

El backend está rechazando requests de usuarios que **SÍ tienen permisos válidos** en el JWT, causando que no puedan trabajar.

### Evidencia

Usuario: **PQRS Guacarí** (rol_id: 19)
JWT contiene permisos correctos:
```json
{
  "permissions": [
    "Ver",
    "Crear",
    "levantamientos:ver",
    "levantamientos:crear",    ✅ TIENE EL PERMISO
    "levantamientos:editar",
    "levantamientos:eliminar"
  ]
}
```

**Pero el backend responde:**
```
403 Forbidden
"Acceso denegado. Tu rol 'PQRS Guacarí' no tiene permisos para este módulo."
```

---

## 🔍 Análisis Técnico

### Qué está pasando:

1. **Backend genera JWT correcto** ✅
   - Login exitoso
   - JWT incluye permisos granulares
   - Frontend recibe el token

2. **Backend rechaza requests posteriores** ❌
   - Cuando el frontend hace `GET /api/master-data/companies`
   - Cuando hace `GET /api/users/by-roles`
   - El backend está verificando permisos del **sistema viejo** (tabla `gestion_roles`)
   - Ignora completamente los permisos del JWT

3. **Resultado:** Usuario autenticado pero bloqueado

---

## 🛠️ Causa Raíz

El backend tiene **DOS sistemas de permisos corriendo simultáneamente**:

### Sistema VIEJO (Problemático):
```typescript
// Middleware verificando tabla gestion_roles
if (!user.role.gestion_roles.includes(moduleId)) {
  throw new ForbiddenException(`Tu rol no tiene permisos para este módulo`);
}
```

### Sistema NUEVO (Correcto):
```typescript
// JWT con permisos granulares
{
  "permissions": ["levantamientos:crear", "levantamientos:editar", ...]
}
```

**El problema:** El sistema viejo se ejecuta PRIMERO y rechaza la request antes de que el sistema nuevo pueda validar.

---

## ✅ Solución Requerida

### Opción 1: Deshabilitar middleware viejo (RECOMENDADO)

**Ubicación probable:** `src/guards/permissions.guard.ts` o similar

```typescript
// ❌ REMOVER/COMENTAR:
@UseGuards(ModulePermissionsGuard)  // <- Este guard usa el sistema viejo
export class MasterDataController {

// ✅ REEMPLAZAR CON:
@UseGuards(JwtPermissionsGuard)  // <- Este guard usa el JWT
export class MasterDataController {
```

### Opción 2: Actualizar orden de guards

Si necesitan ambos sistemas temporalmente:

```typescript
// Ejecutar JWT guard PRIMERO
@UseGuards(JwtPermissionsGuard, ModulePermissionsGuard)
```

### Opción 3: Whitelist de endpoints

Permitir endpoints básicos sin verificación:

```typescript
const PUBLIC_ENDPOINTS = [
  '/api/master-data/companies',
  '/api/users/by-roles',
  '/api/surveys/ucaps/:companyId'
];
```

---

## 📋 Endpoints Afectados

Estos endpoints están bloqueando usuarios con permisos válidos:

| Endpoint | Método | Usado en | Error actual |
|----------|---------|----------|--------------|
| `/api/master-data/companies` | GET | Carga inicial | 403 |
| `/api/users/by-roles` | GET | Cargar recibedores | 403 |
| `/api/master-data/projects/:id` | GET | Cargar proyectos | Posiblemente 403 |
| `/api/surveys/ucaps/:companyId` | GET | Cargar UCAPs | Posiblemente 403 |

---

## 🧪 Cómo Verificar

1. **Ver logs del backend** cuando PQRS Guacarí intenta acceder a `/obras/crear`
2. **Buscar en el código** dónde se lanza el error con texto "no tiene permisos para este módulo"
3. **Identificar el guard/middleware** que está haciendo la verificación
4. **Verificar** si está usando `gestion_roles` en lugar del JWT

### Query para verificar permisos en BD:

```sql
-- Ver permisos asignados al rol
SELECT
  r.nombre_rol,
  STRING_AGG(p.nombre_permiso, ', ') as permisos
FROM roles r
JOIN roles_permisos rp ON r.rol_id = rp.rol_id
JOIN permisos p ON rp.permiso_id = p.permiso_id
WHERE r.rol_id = 19  -- PQRS Guacarí
GROUP BY r.nombre_rol;

-- Ver módulos asignados al rol (sistema viejo)
SELECT
  r.nombre_rol,
  g.nombre as modulo
FROM roles r
LEFT JOIN gestion_roles gr ON r.rol_id = gr.rol_id
LEFT JOIN gestion g ON gr.gestion_id = g.gestion_id
WHERE r.rol_id = 19;
```

---

## ⏱️ Impacto en Producción

- **Todos los PQRS están bloqueados** para crear obras/levantamientos
- No pueden acceder a `/dashboard/levantamiento-obras/obras/crear`
- Error visible en pantalla: "Acceso denegado. Tu rol no tiene permisos..."
- **Frontend aplicó workaround temporal** (ignora el error) pero idealmente debe corregirse en backend

---

## 🔗 Referencias

- Commit frontend con workaround: `aee3a9d`
- Archivo problemático: `src/pages/CrearObraPage.tsx:297`
- Log del JWT con permisos válidos: Ver consola del frontend
- Consulta SQL con permisos correctos: Ver inicio de este documento

---

## 👤 Contacto

**Frontend Developer**: Claude Sonnet 4.5
**Usuario afectado**: Alexsandra Ortiz (reportando en nombre de PQRS)
**Fecha reporte**: 2026-01-20

**PRIORIDAD**: CRÍTICA - Usuarios en producción bloqueados
