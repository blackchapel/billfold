"""Generates the synthetic encrypted PDFs used by tests/unit/infra/pdf-tools.test.ts.

The content is invented ("Total amount due: Rs 1,234.50"); no real bill is involved.
Run: python3 tests/fixtures/pdf/generate.py   (needs pypdf and cryptography; outputs are committed)
"""
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

here = Path(__file__).parent
plain = here / "plain.pdf"

c = canvas.Canvas(str(plain), pagesize=(400, 300))
c.setFont("Helvetica", 14); c.drawString(20, 250, "Jio Bill November 2026")
c.setFont("Helvetica", 12)
c.drawString(20, 220, "Total amount due: Rs 1,234.50")
c.drawString(20, 200, "Due date: 15/12/2026")
c.save()

for algorithm in ["RC4-40", "RC4-128", "AES-128", "AES-256-R5", "AES-256"]:
    writer = PdfWriter(clone_from=PdfReader(str(plain)))
    writer.encrypt(user_password="abc123", owner_password="owner-pw", algorithm=algorithm)
    with open(here / f"{algorithm.lower()}.pdf", "wb") as f:
        writer.write(f)
print("ok")
