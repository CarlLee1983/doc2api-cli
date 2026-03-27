// Minimal PDF with text content (raw PDF syntax)
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 191 >>
stream
BT
/F1 16 Tf
50 740 Td
(API Documentation v1.0) Tj
/F1 12 Tf
0 -30 Td
(GET /api/users) Tj
0 -20 Td
(Returns a list of users) Tj
0 -20 Td
(POST /api/users) Tj
0 -20 Td
(Creates a new user) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000508 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
583
%%EOF`

await Bun.write('tests/fixtures/simple-api.pdf', pdfContent)
console.log('Created tests/fixtures/simple-api.pdf')
