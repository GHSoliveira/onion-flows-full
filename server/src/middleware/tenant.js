/**
 * Tenant isolation middleware
 */
export const requireTenant = async (req, res, next) => {
  const user = req.user;
  const queryTenantId = req.query.tenantId;

  if (user.role === 'SUPER_ADMIN') {
    if (queryTenantId) {
      req.tenantId = queryTenantId;
    }
    return next();
  }

  if (!user.tenantId) {
    return res.status(400).json({ error: 'Usuário não pertence a nenhum tenant' });
  }

  req.tenantId = user.tenantId;
  next();
};
