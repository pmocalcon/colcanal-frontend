import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Work } from '@/services/surveys.service';

// Opciones para los selects
const ZONE_OPTIONS = ['Urbano', 'Rural'];
const REQUEST_TYPE_OPTIONS = [
  'Modernización',
  'Expansión',
  'Operación y Mantenimiento',
  'Inversión',
  'Donación',
  'Otros',
];
const REQUESTING_ENTITY_OPTIONS = [
  'Usuario',
  'Municipio',
  'Interventoría',
  'Concejo Municipal',
  'Propia',
];

interface Company {
  companyId: number;
  name: string;
  abbreviation?: string;
}

interface Project {
  projectId: number;
  name: string;
}

interface UserOption {
  userId: number;
  nombre: string;
}

interface WorkHeaderProps {
  // Modo de operación
  mode: 'view' | 'create' | 'edit';

  // Datos de la obra (para view/edit)
  work?: Work;

  // Datos del levantamiento (opcionales, para mostrar info adicional)
  surveyData?: {
    surveyDate?: string;
    projectCode?: string;
    receivedBy?: string;
    assignedReviewer?: string;
  };

  // Para crear/editar - valores del formulario
  formData?: {
    companyId: number | null;
    projectId: number | null;
    name: string;
    address: string;
    neighborhood: string;
    userName: string;
    requestingEntity: string;
    recordNumber: string;
    sectorVillage: string;
    zone: string;
    userAddress: string;
    areaType: string;
    requestType: string;
    filingNumber: string;
    requestDate: string;
    receivedById: number | null;
    assignedReviewerId: number | null;
  };

  // Callbacks para cambios en el formulario
  onFormChange?: (field: string, value: string | number) => void;

  // Lista de empresas para el select
  companies?: Company[];

  // Empresa seleccionada (para mostrar código)
  selectedCompany?: Company;

  // Lista de proyectos (solo para Canales & Contactos)
  projects?: Project[];

  // Indica si la empresa seleccionada es Canales & Contactos
  isCanalesContactos?: boolean;

  // Lista de usuarios que pueden recibir (PQRS y Coordinador Operativo)
  receivers?: UserOption[];

  // Lista de usuarios revisores
  reviewers?: UserOption[];
}

export function WorkHeader({
  mode,
  work,
  surveyData,
  formData,
  onFormChange,
  companies = [],
  selectedCompany,
  projects = [],
  isCanalesContactos = false,
  receivers = [],
  reviewers = [],
}: WorkHeaderProps) {
  const isEditable = mode === 'create' || mode === 'edit';

  // Valores para mostrar (desde work o formData)
  const getValue = (field: keyof NonNullable<typeof formData>) => {
    if (mode === 'view' && work) {
      const fieldMap: Record<string, string | undefined> = {
        companyId: work.company?.name,
        name: work.name,
        address: work.address,
        neighborhood: work.neighborhood,
        userName: work.userName,
        requestingEntity: work.requestingEntity,
        recordNumber: work.recordNumber,
        sectorVillage: work.sectorVillage,
        zone: work.zone,
        userAddress: work.userAddress,
        areaType: work.areaType,
        requestType: work.requestType,
        filingNumber: work.filingNumber,
        requestDate: work.requestDate,
      };
      return fieldMap[field] || '';
    }
    return formData?.[field]?.toString() || '';
  };

  const getCompanyCode = () => {
    if (mode === 'view' && work?.company) {
      return work.company.abbreviation || '';
    }
    return selectedCompany?.abbreviation || '';
  };

  const getWorkCode = () => {
    if (work?.workCode) return work.workCode;
    return '';
  };

  // Componente de campo reutilizable
  const Field = ({
    label,
    value,
    field,
    type = 'text',
    options,
    required = false,
    readOnly = false,
    className = '',
  }: {
    label: string;
    value: string;
    field?: string;
    type?: 'text' | 'date' | 'select';
    options?: string[];
    required?: boolean;
    readOnly?: boolean;
    className?: string;
  }) => {
    const isFieldEditable = isEditable && !readOnly;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <Label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {isFieldEditable && type === 'select' && options ? (
          <Select
            value={value || ''}
            onValueChange={(val) => field && onFormChange?.(field, val)}
          >
            <SelectTrigger className="h-8 text-sm bg-white">
              <SelectValue placeholder={`Seleccione ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isFieldEditable ? (
          <Input
            key={`${field}-${value}`}
            type={type}
            defaultValue={value}
            onBlur={(e) => field && onFormChange?.(field, e.target.value)}
            className="h-8 text-sm bg-white"
            placeholder={`Ingrese ${label.toLowerCase()}`}
          />
        ) : (
          <div className="h-8 px-3 py-1.5 text-sm bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))] rounded-md flex items-center">
            {value || '-'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
      {/* Header con título */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-6 py-3">
        <h2 className="text-lg font-bold text-white tracking-wide">
          PRESENTACIÓN DE LA OBRA
        </h2>
      </div>

      {/* Subtítulo "Acta de Visita" */}
      <div className="bg-cyan-100 px-6 py-2 border-b border-cyan-200">
        <span className="text-cyan-800 font-semibold text-sm">Acta de Visita</span>
      </div>

      {/* Contenido del formulario */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-4">
          {/* Columna Izquierda */}
          <div className="space-y-3">
            {/* Empresa */}
            {isEditable ? (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Empresa <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData?.companyId?.toString() || ''}
                  onValueChange={(val) => onFormChange?.('companyId', parseInt(val))}
                >
                  <SelectTrigger className="h-8 text-sm bg-white">
                    <SelectValue placeholder="Seleccione una empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.companyId} value={company.companyId.toString()}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field label="Empresa" value={getValue('companyId')} readOnly />
            )}

            {/* Proyecto (solo para Canales & Contactos) */}
            {isEditable && isCanalesContactos && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Proyecto <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData?.projectId?.toString() || ''}
                  onValueChange={(val) => onFormChange?.('projectId', parseInt(val))}
                >
                  <SelectTrigger className="h-8 text-sm bg-white">
                    <SelectValue placeholder="Seleccione un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.projectId} value={project.projectId.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Field
              label="Nombre de la Obra"
              value={getValue('name')}
              field="name"
              required
            />

            <Field
              label="Dirección de Obra"
              value={getValue('address')}
              field="address"
              required
            />

            <Field
              label="Barrio o Corregimiento"
              value={getValue('neighborhood')}
              field="neighborhood"
              required
            />

            <Field
              label="Nombre de Usuario"
              value={getValue('userName')}
              field="userName"
            />

            <Field
              label="Solicitante Por Entidad O Institución"
              value={getValue('requestingEntity')}
              field="requestingEntity"
              type="select"
              options={REQUESTING_ENTITY_OPTIONS}
            />

            <Field
              label="Fecha De Solicitud"
              value={getValue('requestDate')}
              field="requestDate"
              type="date"
            />

            {/* Recibe - Select de usuarios PQRS y Coordinador Operativo */}
            {isEditable ? (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Recibe
                </Label>
                <Select
                  value={formData?.receivedById?.toString() || ''}
                  onValueChange={(val) => onFormChange?.('receivedById', parseInt(val))}
                >
                  <SelectTrigger className="h-8 text-sm bg-white">
                    <SelectValue placeholder="Seleccione quien recibe" />
                  </SelectTrigger>
                  <SelectContent>
                    {receivers.map((user) => (
                      <SelectItem key={user.userId} value={user.userId.toString()}>
                        {user.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : surveyData?.receivedBy ? (
              <Field label="Recibe" value={surveyData.receivedBy} readOnly />
            ) : null}

            {/* Revisor Designado - Select de usuarios revisores */}
            {isEditable ? (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">
                  Revisor Designado
                </Label>
                <Select
                  value={formData?.assignedReviewerId?.toString() || ''}
                  onValueChange={(val) => onFormChange?.('assignedReviewerId', parseInt(val))}
                >
                  <SelectTrigger className="h-8 text-sm bg-white">
                    <SelectValue placeholder="Seleccione revisor" />
                  </SelectTrigger>
                  <SelectContent>
                    {reviewers.map((user) => (
                      <SelectItem key={user.userId} value={user.userId.toString()}>
                        {user.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : surveyData?.assignedReviewer ? (
              <Field label="Revisor Designado" value={surveyData.assignedReviewer} readOnly />
            ) : null}
          </div>

          {/* Columna Derecha */}
          <div className="space-y-3">
            {/* Fecha de levantamiento (solo lectura, viene del survey) */}
            {surveyData?.surveyDate && (
              <Field
                label="Fecha de levantamiento"
                value={surveyData.surveyDate}
                readOnly
              />
            )}

            {/* Código de proyecto (solo lectura, viene del survey) */}
            {surveyData?.projectCode && (
              <Field
                label="Cod. Proyecto"
                value={surveyData.projectCode}
                readOnly
              />
            )}

            <Field
              label="Número de Acta"
              value={getValue('recordNumber')}
              field="recordNumber"
            />

            <Field
              label="Sector o vereda"
              value={getValue('sectorVillage')}
              field="sectorVillage"
            />

            <Field
              label="Zona"
              value={getValue('zone')}
              field="zone"
              type="select"
              options={ZONE_OPTIONS}
            />

            <Field
              label="Dirección de Usuario"
              value={getValue('userAddress')}
              field="userAddress"
            />

            <Field
              label="Tipo De Área A Iluminar"
              value={getValue('areaType')}
              field="areaType"
            />

            <Field
              label="Tipo de Solicitud"
              value={getValue('requestType')}
              field="requestType"
              type="select"
              options={REQUEST_TYPE_OPTIONS}
              required
            />

            <Field
              label="Cod. Obra"
              value={getWorkCode()}
              readOnly
            />

            <Field
              label="No. Radicado"
              value={getValue('filingNumber')}
              field="filingNumber"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkHeader;
