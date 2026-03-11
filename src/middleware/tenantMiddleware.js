/**
 * Tenant isolation middleware
 */
export function requireTenantId(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({
      error: 'X-Tenant-ID header is required'
    });
  }
  
  req.tenantId = tenantId;
  next();
}

/**
 * Validate tenant access to a resource
 */
export function validateTenantAccess(resourceTenantId, requestingTenantId) {
  if (resourceTenantId !== requestingTenantId) {
    throw new Error('Access denied: tenant mismatch');
  }
}
