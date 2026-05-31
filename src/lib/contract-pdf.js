import {
  bufferFromPdfDocument,
  createLetterPdfDocument,
  renderBrandedPdfHeader,
  renderPdfFooter,
} from "./document-pdf-core.js";

export async function buildContractPdfBuffer({ contract, branding = {} }) {
  if (!contract?.id && !contract?._id) {
    throw new Error("Contract payload is required");
  }

  const doc = createLetterPdfDocument({
    Title: `Contract ${contract.id}`,
    Author: branding.companyName || "FieldBase",
    Subject: "Contract",
  });

  const bufferPromise = bufferFromPdfDocument(doc);

  const meta = [
    contract.contractCategory ? `Category: ${contract.contractCategory}` : null,
    contract.status ? `Status: ${contract.status}` : null,
    contract.amount ? `Amount: ${contract.amount}` : null,
  ]
    .filter(Boolean)
    .join("   |   ");

  const { pageWidth, companyName } = await renderBrandedPdfHeader(doc, {
    title: "Service Contract",
    subtitle: contract.clientName || "",
    meta,
    branding,
  });

  if (contract.jobTitle) {
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`Project: ${contract.jobTitle}`);
    doc.moveDown(0.5);
  }

  doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(String(contract.body || ""), {
    width: pageWidth,
    align: "left",
    lineGap: 3,
  });

  renderPdfFooter(doc, companyName);
  doc.end();
  return bufferPromise;
}

export function pdfFilenameForContract(contract) {
  const id = contract?.id || contract?._id || "contract";
  return `contract_${String(id).slice(0, 8)}.pdf`;
}
