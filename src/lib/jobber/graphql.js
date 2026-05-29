import {
  JOBBER_GRAPHQL_URL,
  JOBBER_GRAPHQL_VERSION,
} from "./config.js";

/**
 * Execute a Jobber GraphQL operation.
 * @param {string} accessToken
 * @param {string} query
 * @param {object} [variables]
 */
export async function jobberGraphql(accessToken, query, variables = {}) {
  const response = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error_description ||
      `Jobber API HTTP ${response.status}`;
    throw new Error(message);
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message || "Jobber GraphQL error");
  }

  return payload.data || {};
}

/**
 * Paginate a Jobber connection field until exhausted.
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.connectionPath dot path e.g. "clients"
 * @param {string} params.query full GraphQL query with $cursor variable
 * @param {(nodes: object[]) => Promise<void>|void} params.onPage
 * @param {number} [params.pageSize]
 */
/**
 * Try queries in order until one paginates successfully (API version drift).
 */
export async function paginateJobberConnectionWithFallback({
  accessToken,
  connectionPath,
  queries,
  onPage,
  pageSize = 25,
}) {
  const list = Array.isArray(queries) ? queries.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("No Jobber GraphQL queries provided");
  }

  let lastError = null;
  for (const query of list) {
    try {
      await paginateJobberConnection({
        accessToken,
        connectionPath,
        query,
        onPage,
        pageSize,
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Jobber GraphQL pagination failed");
}

export async function paginateJobberConnection({
  accessToken,
  connectionPath,
  query,
  onPage,
  pageSize = 25,
}) {
  let cursor = null;
  let hasNextPage = true;
  const pathParts = connectionPath.split(".");

  while (hasNextPage) {
    const data = await jobberGraphql(accessToken, query, {
      cursor,
      first: pageSize,
    });

    let connection = data;
    for (const part of pathParts) {
      connection = connection?.[part];
    }

    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
    if (nodes.length) {
      await onPage(nodes);
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor || null;
    if (hasNextPage && !cursor) break;
  }
}
