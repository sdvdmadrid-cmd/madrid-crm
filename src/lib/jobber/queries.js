export const JOBBER_CLIENTS_QUERY = `
  query JobberClients($cursor: String, $first: Int!) {
    clients(first: $first, after: $cursor) {
      nodes {
        id
        name
        firstName
        lastName
        companyName
        isCompany
        jobberWebUri
        emails {
          address
          primary
        }
        phones {
          number
          friendly
          primary
        }
        billingAddress {
          street1
          street2
          city
          province
          postalCode
        }
        clientProperties: properties(first: 25) {
          nodes {
            id
            name
            address {
              street1
              street2
              city
              province
              postalCode
            }
          }
        }
        clientNotes: notes(first: 100) {
          nodes {
            __typename
            ... on ClientNote {
              id
              message
              createdAt
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Fallback when note union fields differ across API versions. */
export const JOBBER_CLIENTS_QUERY_LITE = `
  query JobberClientsLite($cursor: String, $first: Int!) {
    clients(first: $first, after: $cursor) {
      nodes {
        id
        name
        firstName
        lastName
        companyName
        isCompany
        jobberWebUri
        emails {
          address
          primary
        }
        phones {
          number
          friendly
          primary
        }
        billingAddress {
          street1
          street2
          city
          province
          postalCode
        }
        clientProperties: properties(first: 25) {
          nodes {
            id
            name
            address {
              street1
              street2
              city
              province
              postalCode
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const JOBBER_JOBS_QUERY = `
  query JobberJobs($cursor: String, $first: Int!) {
    jobs(first: $first, after: $cursor) {
      nodes {
        id
        jobNumber
        title
        instructions
        jobStatus
        client {
          id
        }
        property {
          id
          address {
            street1
            city
            province
            postalCode
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const JOBBER_QUOTES_QUERY = `
  query JobberQuotes($cursor: String, $first: Int!) {
    quotes(first: $first, after: $cursor) {
      nodes {
        id
        quoteNumber
        title
        quoteStatus
        message
        client {
          id
        }
        lineItems(first: 50) {
          nodes {
            id
            name
            description
            qty
            unitPrice
            total
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const JOBBER_INVOICES_QUERY = `
  query JobberInvoices($cursor: String, $first: Int!) {
    invoices(first: $first, after: $cursor) {
      nodes {
        id
        invoiceNumber
        subject
        invoiceStatus
        amounts {
          total
        }
        client {
          id
        }
        lineItems(first: 50) {
          nodes {
            id
            name
            description
            qty
            unitPrice
            total
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const JOBBER_REQUESTS_QUERY = `
  query JobberRequests($cursor: String, $first: Int!) {
    requests(first: $first, after: $cursor) {
      nodes {
        id
        title
        requestStatus
        details
        client {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const JOBBER_VISITS_QUERY = `
  query JobberVisits($cursor: String, $first: Int!) {
    visits(first: $first, after: $cursor) {
      nodes {
        id
        title
        instructions
        startAt
        endAt
        completedAt
        visitStatus
        client {
          id
        }
        job {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
