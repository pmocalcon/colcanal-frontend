import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { surveysService, type CreateWorkDto, type CreateSurveyDto } from '@/services/surveys.service';
import { masterDataService, type Company, type Project } from '@/services/master-data.service';
import { usersService, type User } from '@/services/users.service';
import { WorkHeader } from '@/components/surveys/WorkHeader';
import { BudgetSection, createInitialBudgetItems, type BudgetItemData } from '@/components/surveys/BudgetSection';
import { InvestmentSection, createInitialInvestmentData, type InvestmentSectionData } from '@/components/surveys/InvestmentSection';
import { DocumentLinksSection, createInitialDocumentLinks, type DocumentLinksData } from '@/components/surveys/DocumentLinksSection';
import { MaterialsSection, createInitialMaterialItems, type MaterialItemData } from '@/components/surveys/MaterialsSection';
import { TravelExpensesSection, createInitialTravelExpenses, type TravelExpenseItemData } from '@/components/surveys/TravelExpensesSection';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, Save, CheckCircle, X, Loader2 } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { ErrorMessage } from '@/components/ui/error-message';

// IDs de roles para PQRS y Coordinador Operativo (recibedores)
const RECEIVER_ROLE_IDS = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32];
// IDs de roles para revisores
const REVIEWER_ROLE_IDS = [8, 9, 10, 11];

interface FormData {
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
}

const INITIAL_FORM_DATA: FormData = {
  companyId: null,
  projectId: null,
  name: '',
  address: '',
  neighborhood: '',
  userName: '',
  requestingEntity: '',
  recordNumber: '',
  sectorVillage: '',
  zone: '',
  userAddress: '',
  areaType: '',
  requestType: '',
  filingNumber: '',
  requestDate: new Date().toISOString().split('T')[0],
  receivedById: null,
  assignedReviewerId: null,
};

export default function CrearObraPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // State
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [receivers, setReceivers] = useState<User[]>([]);
  const [reviewers, setReviewers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdWorkCode, setCreatedWorkCode] = useState<string | null>(null);
  const [existingSurveyId, setExistingSurveyId] = useState<number | null>(null);

  // Budget state
  const [budgetItems, setBudgetItems] = useState<BudgetItemData[]>(createInitialBudgetItems());
  const [ippValue, setIppValue] = useState<number | null>(null);

  // Investment section state
  const [investmentData, setInvestmentData] = useState<InvestmentSectionData>(createInitialInvestmentData());

  // Document links state (croquis and mapa URLs)
  const [documentLinks, setDocumentLinks] = useState<DocumentLinksData>(createInitialDocumentLinks());

  // Materials state
  const [materialItems, setMaterialItems] = useState<MaterialItemData[]>(createInitialMaterialItems());

  // Travel expenses state
  const [travelExpenses, setTravelExpenses] = useState<TravelExpenseItemData[]>(createInitialTravelExpenses());

  // Check if company is "Canales & Contactos"
  const isCanalesContactos = useMemo(() => {
    if (!Array.isArray(companies) || !formData.companyId) return false;
    const company = companies.find((c) => c.companyId === formData.companyId);
    return company?.name === 'Canales & Contactos';
  }, [formData.companyId, companies]);

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, [id]);

  // Cargar proyectos cuando cambia la empresa
  useEffect(() => {
    if (formData.companyId && isCanalesContactos) {
      loadProjects(formData.companyId);
    } else {
      setProjects([]);
      // Limpiar proyecto si cambia a empresa que no es Canales & Contactos
      if (formData.projectId) {
        setFormData((prev) => ({ ...prev, projectId: null }));
      }
    }
  }, [formData.companyId, isCanalesContactos]);

  const loadProjects = async (companyId: number) => {
    try {
      const projectsData = await masterDataService.getProjects(companyId);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setProjects([]);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar empresas
      const companiesData = await masterDataService.getCompanies();
      setCompanies(Array.isArray(companiesData) ? companiesData : []);

      // Cargar usuarios recibedores (PQRS y Coordinador Operativo)
      const receiversData = await usersService.getByRoles(RECEIVER_ROLE_IDS);
      setReceivers(receiversData);

      // Cargar usuarios revisores
      const reviewersData = await usersService.getByRoles(REVIEWER_ROLE_IDS);
      setReviewers(reviewersData);

      // Si es modo edición, cargar la obra y su levantamiento
      if (isEditMode && id) {
        const workId = parseInt(id);
        const work = await surveysService.getWorkById(workId);
        setFormData({
          companyId: work.companyId,
          projectId: null, // TODO: Agregar projectId a Work si es necesario
          name: work.name,
          address: work.address,
          neighborhood: work.neighborhood,
          userName: work.userName || '',
          requestingEntity: work.requestingEntity || '',
          recordNumber: work.recordNumber || '',
          sectorVillage: work.sectorVillage || '',
          zone: work.zone || '',
          userAddress: work.userAddress || '',
          areaType: work.areaType || '',
          requestType: work.requestType || '',
          filingNumber: work.filingNumber || '',
          requestDate: work.requestDate || '',
          receivedById: null, // TODO: Cargar desde work si existe
          assignedReviewerId: null, // TODO: Cargar desde work si existe
        });

        // Cargar el levantamiento existente para esta obra
        try {
          const surveysResponse = await surveysService.getSurveys({ workId });
          if (surveysResponse.data && surveysResponse.data.length > 0) {
            const surveyId = surveysResponse.data[0].surveyId;
            setExistingSurveyId(surveyId);
            console.log('Found existing survey:', surveyId);

            // Cargar el survey completo con todos sus datos
            const fullSurvey = await surveysService.getSurveyById(surveyId);
            console.log('Full survey data:', fullSurvey);

            // Cargar fecha de solicitud si existe
            if (fullSurvey.requestDate) {
              setFormData((prev) => ({
                ...prev,
                requestDate: fullSurvey.requestDate || '',
              }));
            }

            // Cargar document links
            if (fullSurvey.sketchUrl || fullSurvey.mapUrl) {
              setDocumentLinks({
                sketchUrl: fullSurvey.sketchUrl || '',
                mapUrl: fullSurvey.mapUrl || '',
              });
            }

            // Cargar investment data (flags y descripción)
            const surveyData = fullSurvey as any;
            setInvestmentData((prev) => ({
              ...prev,
              description: surveyData.description || '',
              questions: {
                requiresPhotometricStudies: surveyData.requiresPhotometricStudies || false,
                requiresRetieCertification: surveyData.requiresRetieCertification || false,
                requiresRetilapCertification: surveyData.requiresRetilapCertification || false,
                requiresCivilWork: surveyData.requiresCivilWork || false,
              },
              // Cargar investment items si existen
              items: surveyData.investmentItems?.length > 0
                ? surveyData.investmentItems.map((item: any, index: number) => ({
                    itemNumber: index + 1,
                    orderNumber: item.orderNumber || '',
                    point: item.point || `P${index + 1}`,
                    description: item.description || '',
                    lumQuantity: item.luminaireQuantity?.toString() || '',
                    lumRelocatedQuantity: item.relocatedLuminaireQuantity?.toString() || '',
                    poleQuantity: item.poleQuantity?.toString() || '',
                    twistedNetwork: item.braidedNetwork || '',
                    latitude: item.latitude || '',
                    longitude: item.longitude || '',
                  }))
                : prev.items,
            }));

            // Cargar IPP value si existe
            if (surveyData.ippValue) {
              setIppValue(surveyData.ippValue);
            }

            // Cargar budget items si existen
            if (surveyData.budgetItems?.length > 0) {
              const loadedBudgetItems = createInitialBudgetItems();
              surveyData.budgetItems.forEach((item: any, index: number) => {
                if (index < loadedBudgetItems.length) {
                  const quantity = parseFloat(item.quantity) || 0;
                  const unitValue = parseFloat(item.unitValue) || 0;
                  loadedBudgetItems[index] = {
                    ...loadedBudgetItems[index],
                    ucapId: item.ucapId || null,
                    ucapCode: item.ucap?.code || '',
                    ucapDescription: item.ucap?.description || '',
                    unitValue: unitValue,
                    quantity: quantity,
                    budgetedValue: quantity * unitValue,
                  };
                }
              });
              setBudgetItems(loadedBudgetItems);
            }

            // Cargar material items si existen
            if (surveyData.materialItems?.length > 0) {
              const loadedMaterialItems = createInitialMaterialItems();
              surveyData.materialItems.forEach((item: any, index: number) => {
                if (index < loadedMaterialItems.length) {
                  loadedMaterialItems[index] = {
                    ...loadedMaterialItems[index],
                    materialId: item.materialId || null,
                    materialCode: item.material?.code || '',
                    description: item.material?.description || '',
                    unitOfMeasure: item.unitOfMeasure || 'Unidad',
                    quantity: item.quantity?.toString() || '',
                    observations: item.observations || '',
                  };
                }
              });
              setMaterialItems(loadedMaterialItems);
            }

            // Cargar travel expenses si existen
            if (surveyData.travelExpenses?.length > 0) {
              const loadedTravelExpenses = createInitialTravelExpenses();
              surveyData.travelExpenses.forEach((expense: any) => {
                const expenseIndex = loadedTravelExpenses.findIndex(
                  (e) => e.expenseType === expense.expenseType
                );
                if (expenseIndex !== -1) {
                  loadedTravelExpenses[expenseIndex] = {
                    ...loadedTravelExpenses[expenseIndex],
                    quantity: expense.quantity?.toString() || '',
                    observations: expense.observations || '',
                  };
                }
              });
              setTravelExpenses(loadedTravelExpenses);
            }
          }
        } catch (surveyErr) {
          console.log('No existing survey found for this work or error loading:', surveyErr);
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Manejar cambios en el formulario
  const handleFormChange = (field: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Obtener empresa seleccionada
  const selectedCompany = companies.find((c) => c.companyId === formData.companyId);

  // Handle IPP value change
  const handleIppValueChange = useCallback((value: number | null) => {
    setIppValue(value);
  }, []);

  // Validar formulario
  const validateForm = (): boolean => {
    if (!formData.companyId) {
      setError('Debe seleccionar una empresa');
      return false;
    }
    if (isCanalesContactos && !formData.projectId) {
      setError('Debe seleccionar un proyecto para Canales & Contactos');
      return false;
    }
    if (!formData.name.trim()) {
      setError('Debe ingresar el nombre de la obra');
      return false;
    }
    if (!formData.address.trim()) {
      setError('Debe ingresar la dirección de la obra');
      return false;
    }
    if (!formData.neighborhood.trim()) {
      setError('Debe ingresar el barrio o corregimiento');
      return false;
    }
    if (!formData.requestType) {
      setError('Debe seleccionar el tipo de solicitud');
      return false;
    }
    return true;
  };

  // Enviar formulario
  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);
      setError(null);

      // Step 1: Create or update Work
      const workData: CreateWorkDto = {
        companyId: formData.companyId!,
        name: formData.name.trim(),
        address: formData.address.trim(),
        neighborhood: formData.neighborhood.trim(),
        userName: formData.userName.trim() || '',
        requestingEntity: formData.requestingEntity || '',
        recordNumber: formData.recordNumber.trim() || '',
        sectorVillage: formData.sectorVillage.trim() || '',
        zone: formData.zone || '',
        userAddress: formData.userAddress.trim() || '',
        areaType: formData.areaType.trim() || '',
        requestType: formData.requestType,
        filingNumber: formData.filingNumber.trim() || '',
      };

      let workResult;
      if (isEditMode && id) {
        workResult = await surveysService.updateWork(parseInt(id), workData);
      } else {
        workResult = await surveysService.createWork(workData);
      }

      // Step 2: Create Survey with the workId
      // Get receiver name from receivers list
      const receiverName = formData.receivedById
        ? receivers.find((r) => r.userId === formData.receivedById)?.nombre
        : undefined;

      const surveyData: CreateSurveyDto = {
        workId: workResult.workId,
        surveyDate: new Date().toISOString().split('T')[0],
        requestDate: formData.requestDate || undefined,
        receivedBy: receiverName, // Send name, not ID
        // Document links
        sketchUrl: documentLinks.sketchUrl || undefined,
        mapUrl: documentLinks.mapUrl || undefined,
        // Requirements flags
        requiresPhotometricStudies: investmentData.questions.requiresPhotometricStudies,
        requiresRetieCertification: investmentData.questions.requiresRetieCertification,
        requiresRetilapCertification: investmentData.questions.requiresRetilapCertification,
        requiresCivilWork: investmentData.questions.requiresCivilWork,
        // IPP value for budget calculation
        ippValue: ippValue || undefined,
        // Budget items (filter only items with ucapId)
        budgetItems: budgetItems
          .filter((item) => item.ucapId !== null && parseFloat(item.quantity) > 0)
          .map((item) => ({
            ucapId: item.ucapId!,
            quantity: parseFloat(item.quantity) || 0,
          })),
        // Investment items (filter only items with data)
        investmentItems: investmentData.items
          .filter((item) => item.description || item.poleQuantity || item.lumQuantity || item.latitude)
          .map((item) => ({
            orderNumber: item.orderNumber || undefined,
            point: item.point,
            description: item.description || undefined,
            luminaireQuantity: parseFloat(item.lumQuantity) || undefined,
            relocatedLuminaireQuantity: parseFloat(item.lumRelocatedQuantity) || undefined,
            poleQuantity: parseFloat(item.poleQuantity) || undefined,
            braidedNetwork: item.twistedNetwork || undefined,
            latitude: item.latitude || undefined,
            longitude: item.longitude || undefined,
          })),
        // Material items (filter only items with materialId)
        materialItems: materialItems
          .filter((item) => item.materialId !== null && parseFloat(item.quantity) > 0)
          .map((item) => ({
            materialId: item.materialId!,
            unitOfMeasure: item.unitOfMeasure || 'Unidad',
            quantity: parseFloat(item.quantity) || 0,
            observations: item.observations || undefined,
          })),
        // Travel expenses (filter only items with quantity)
        travelExpenses: travelExpenses
          .filter((item) => parseFloat(item.quantity) > 0)
          .map((item) => ({
            expenseType: item.expenseType,
            quantity: parseFloat(item.quantity) || 0,
            observations: item.observations || undefined,
          })),
      };

      // Debug: Log the survey data being sent
      console.log(`${existingSurveyId ? 'Updating' : 'Creating'} survey with data:`, JSON.stringify(surveyData, null, 2));

      try {
        let surveyResult;
        if (existingSurveyId) {
          // Actualizar levantamiento existente
          surveyResult = await surveysService.updateSurvey(existingSurveyId, surveyData);
          console.log('Survey updated successfully:', surveyResult);
        } else {
          // Crear nuevo levantamiento
          surveyResult = await surveysService.createSurvey(surveyData);
          console.log('Survey created successfully:', surveyResult);
        }
      } catch (surveyErr: any) {
        console.error('Survey operation failed:', surveyErr);
        console.error('Survey error response:', surveyErr.response?.data);
        // Show more detailed error for survey
        const surveyErrorMsg = surveyErr.response?.data?.message ||
          (Array.isArray(surveyErr.response?.data?.message)
            ? surveyErr.response.data.message.join(', ')
            : `Error al ${existingSurveyId ? 'actualizar' : 'crear'} el levantamiento`);
        throw new Error(`Obra ${isEditMode ? 'actualizada' : 'creada'} (${workResult.workCode}), pero falló el levantamiento: ${surveyErrorMsg}`);
      }

      setSuccess(true);
      setCreatedWorkCode(workResult.workCode);

      // Limpiar formulario si es creación
      if (!isEditMode) {
        setFormData(INITIAL_FORM_DATA);
        setBudgetItems(createInitialBudgetItems());
        setIppValue(null);
        setInvestmentData(createInitialInvestmentData());
        setDocumentLinks(createInitialDocumentLinks());
        setMaterialItems(createInitialMaterialItems());
        setTravelExpenses(createInitialTravelExpenses());
      }

      // Ocultar mensaje de éxito después de 5 segundos
      setTimeout(() => {
        setSuccess(false);
        setCreatedWorkCode(null);
      }, 5000);
    } catch (err: any) {
      console.error('Error saving work/survey:', err);
      // Handle both API errors and regular Error objects
      const errorMessage = err.message || err.response?.data?.message || 'Error al guardar la obra y levantamiento';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Home Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>

              {/* Back Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/levantamiento-obras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Levantamiento de Obras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {isEditMode ? 'Editar Obra' : 'Nueva Obra'}
              </p>
            </div>

            {/* Right spacer */}
            <div className="w-32" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Success Message */}
        {success && createdWorkCode && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-green-800 font-semibold">
                {isEditMode ? '!Obra actualizada exitosamente!' : '!Obra creada exitosamente!'}
              </p>
              <p className="text-green-700 text-sm">
                Código de obra: <span className="font-mono font-bold">{createdWorkCode}</span>
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && <ErrorMessage message={error} className="mb-6" />}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* Work Header Component */}
            <WorkHeader
              mode={isEditMode ? 'edit' : 'create'}
              formData={formData}
              onFormChange={handleFormChange}
              companies={companies}
              selectedCompany={selectedCompany}
              projects={projects}
              isCanalesContactos={isCanalesContactos}
              receivers={receivers.map((u) => ({ userId: u.userId, nombre: u.nombre }))}
              reviewers={reviewers.map((u) => ({ userId: u.userId, nombre: u.nombre }))}
            />

            {/* Budget Section */}
            <BudgetSection
              workName={formData.name}
              companyId={formData.companyId}
              projectId={formData.projectId}
              items={budgetItems}
              onItemsChange={setBudgetItems}
              ippValue={ippValue}
              onIppValueChange={handleIppValueChange}
            />

            {/* Investment Section */}
            <InvestmentSection
              data={investmentData}
              onDataChange={setInvestmentData}
            />

            {/* Document Links Section (Croquis y Mapa) */}
            <DocumentLinksSection
              data={documentLinks}
              onDataChange={setDocumentLinks}
            />

            {/* Materials Section */}
            <MaterialsSection
              items={materialItems}
              onItemsChange={setMaterialItems}
            />

            {/* Travel Expenses Section */}
            <TravelExpensesSection
              items={travelExpenses}
              onItemsChange={setTravelExpenses}
            />

            {/* Submit Button */}
            <div className="flex justify-center mt-8">
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white px-8 py-3 text-lg shadow-lg"
                size="lg"
              >
                {saving ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    {isEditMode ? 'Actualizar Obra' : 'Guardar Obra'}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </main>

      <Footer />

      {/* Fixed Toast Notifications */}
      {/* Saving Toast */}
      {saving && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[300px]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <div>
              <p className="font-semibold">Guardando...</p>
              <p className="text-sm text-blue-100">Por favor espere mientras se guardan los datos</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {success && createdWorkCode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[350px]">
            <CheckCircle className="w-7 h-7 flex-shrink-0" />
            <div className="flex-grow">
              <p className="font-semibold text-lg">
                {isEditMode ? '¡Obra actualizada!' : '¡Obra creada!'}
              </p>
              <p className="text-sm text-green-100">
                Código: <span className="font-mono font-bold">{createdWorkCode}</span>
              </p>
            </div>
            <button
              onClick={() => setSuccess(false)}
              className="p-1 hover:bg-green-500 rounded-full transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[350px] max-w-[500px]">
            <X className="w-7 h-7 flex-shrink-0" />
            <div className="flex-grow">
              <p className="font-semibold text-lg">Error</p>
              <p className="text-sm text-red-100">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-500 rounded-full transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
