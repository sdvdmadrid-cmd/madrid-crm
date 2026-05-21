/**
 * CRM domain helpers — import from @/lib/crm for tenant-scoped CRM work.
 */

export {
  buildClientInsertRow,
  CLIENT_SELECT_COLUMNS,
  createClientErrorResponse,
  serializeClient,
} from "@/lib/client-records";

export {
  getBackFallbackPath,
  getCrmBreadcrumbs,
  shouldShowCrmNav,
} from "@/lib/crm-navigation";

export {
  getListPaginationParams,
  scopeByTenant,
  scopedTable,
} from "@/lib/tenant-scope";
