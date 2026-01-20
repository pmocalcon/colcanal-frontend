# Problemas con Sistema de Accesos - Backend

**Fecha**: 2026-01-20
**Severidad**: Alta
**Módulos afectados**: Surveys, User Access, Permissions

---

## 🔴 Problema 1: Estructura de datos inconsistente en `/surveys/my-access`

### Descripción
El endpoint `/surveys/my-access` retorna datos con estructura inconsistente. Mezcla **empresas** y **proyectos** en el mismo array `companies`, causando confusión en el frontend.

### Evidencia
```json
{
  "companies": [
    {
      "companyId": 8,
      "name": "Unión Temporal Alumbrado Público Santa Bárbara",
      "accessId": 123
      // ✅ Esta SÍ es una empresa (no tiene parentCompanyId)
    },
    {
      "companyId": 2,
      "name": "Ciudad Bolívar",
      "accessId": 124,
      "parentCompanyId": 1  // ❌ Este es un PROYECTO de la empresa ID: 1
    },
    {
      "companyId": 3,
      "name": "Jericó",
      "accessId": 125,
      "parentCompanyId": 1  // ❌ Este es un PROYECTO de la empresa ID: 1
    }
  ]
}
```

**En el frontend aparece como:**
```
Ciudad Bolívar - ID: 2 • Empresa ID: 1
Jericó - ID: 3 • Empresa ID: 1
```

### Impacto
- **Frontend no puede mapear correctamente los departamentos** porque no sabe si es empresa o proyecto
- **Los filtros de obras/levantamientos no funcionan** porque se mezclan IDs de empresas y proyectos
- **Interfaz de asignación de accesos confusa** porque aparecen "empresas" que en realidad son proyectos

### Solución esperada
El endpoint `/surveys/my-access` debe retornar claramente separados:

```json
{
  "companies": [
    {
      "companyId": 8,
      "name": "Unión Temporal Alumbrado Público Santa Bárbara",
      "accessId": 123
    }
  ],
  "projects": [
    {
      "projectId": 2,
      "name": "Ciudad Bolívar",
      "companyId": 1,
      "accessId": 124
    },
    {
      "projectId": 3,
      "name": "Jericó",
      "companyId": 1,
      "accessId": 125
    }
  ]
}
```

---

## 🔴 Problema 2: Filtro de obras por `companyId` no funciona correctamente

### Descripción
Al filtrar obras usando el endpoint `/surveys/works?companyId=X`, el backend retorna obras que **NO** pertenecen a esos `companyId`.

### Escenario de reproducción

1. **Usuario tiene acceso a**: Valle del Cauca (empresas ID: 6, 7, 9)
   - ID 6: Unión Temporal Alumbrado Público El Cerrito
   - ID 7: Unión Temporal Alumbrado Público Guacarí
   - ID 9: Unión Temporal Alumbrado Público Jamundí

2. **Frontend envía**: `GET /surveys/works?companyId=6,7,9&createdBy=12`

3. **Backend retorna**: Obras con `companyId=4` (Circasia - Quindío) ❌

### Logs del frontend
```javascript
🔍 [loadWorks] Cargando obras para: {
  departamento: "Valle del Cauca",
  companyIds: [6, 7, 9],
  userId: 12
}

🔍 [loadWorks] CompanyIds en las obras: [
  { workId: 1, name: "nombre 1", companyId: 4, companyName: "Unión Temporal Alumbrado Público Circasia" },
  { workId: 2, name: "prueba de nombre", companyId: 4, companyName: "Unión Temporal Alumbrado Público Circasia" }
]
```

### Impacto
- **Usuario ve obras de otros departamentos** que no debería ver
- **Filtro de seguridad no funciona** - posible acceso no autorizado a datos

### Solución esperada
El endpoint `/surveys/works` debe respetar ESTRICTAMENTE el filtro `companyId`:
- Si `companyId=6,7,9`, solo retornar obras donde `work.companyId IN (6,7,9)`
- No retornar ninguna obra con `companyId` diferente

---

## 🔴 Problema 3: Permisos de rol no se aplican correctamente

### Descripción
Aunque se asignaron permisos al rol para acceder al módulo "levantamiento-obras", el usuario sigue recibiendo error de "Acceso denegado".

### Escenario de reproducción

1. **Rol**: "PQRS Jericó" (roleId: X)
2. **Permiso asignado**: Módulo "Levantamiento de Obras" (slug: `levantamiento-obras` o `surveys`)
3. **Usuario**: Danelly Ramirez (userId: 12) con rol "PQRS Jericó"
4. **Acción**: Intenta crear una obra en `/dashboard/levantamiento-obras/obras/crear`
5. **Error**:
   ```
   Acceso denegado. Tu rol "PQRS Jericó" no tiene permisos para este módulo.
   Contactar a Alexsandra Ortiz para la solución.
   ```

### Evidencia adicional
- Permisos fueron asignados correctamente desde Admin → Usuarios → Roles
- Usuario reinició sesión después de asignar permisos
- Error persiste

### Posibles causas
1. **Slug incorrecto**: El slug del módulo en la BD no coincide con el slug verificado en el middleware
   - Frontend espera: `levantamiento-obras`
   - Backend verifica: `surveys` o `works`?

2. **Cache de permisos**: Los permisos se cachean al hacer login y no se refrescan

3. **Middleware incorrecto**: El middleware que valida permisos no está consultando correctamente la tabla de permisos del rol

### Solución esperada
1. **Documentar los slugs exactos** de cada módulo en la base de datos
2. **Verificar la query** que obtiene permisos del rol en el middleware
3. **Agregar logs** en el middleware de permisos para debug:
   ```javascript
   console.log('Validando permiso:', {
     userId,
     roleId,
     requiredSlug: 'levantamiento-obras',
     userPermissions: [...],
     hasAccess: boolean
   });
   ```

---

## 📋 Resumen de acciones requeridas

### Prioridad Alta
- [ ] Separar `companies` y `projects` en `/surveys/my-access`
- [ ] Corregir filtro de `companyId` en `/surveys/works`
- [ ] Investigar y corregir validación de permisos de rol

### Prioridad Media
- [ ] Documentar estructura de datos de empresas vs proyectos
- [ ] Agregar logs de debug en middleware de permisos
- [ ] Documentar slugs de módulos disponibles

### Información adicional necesaria
1. ¿Cuál es la estructura exacta de la tabla de empresas y proyectos?
2. ¿Cuáles son los slugs exactos de los módulos en la BD?
3. ¿Cómo funciona el sistema de cache de permisos?

---

## Contacto
Frontend Developer: Claude Sonnet 4.5
Usuario reportando: Alexsandra Ortiz
Fecha: 2026-01-20
