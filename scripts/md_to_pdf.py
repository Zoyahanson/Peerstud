from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def markdown_line_to_html(line: str) -> str:
    stripped = line.strip()
    if not stripped:
        return ""
    if stripped.startswith("### "):
        return f"<b>{stripped[4:]}</b>"
    if stripped.startswith("## "):
        return f"<b>{stripped[3:]}</b>"
    if stripped.startswith("# "):
        return f"<b>{stripped[2:]}</b>"
    if stripped.startswith("- "):
        return f"&#8226; {stripped[2:]}"
    if stripped[0].isdigit() and ". " in stripped:
        return stripped
    return stripped


def convert_markdown_to_pdf(md_path: Path, pdf_path: Path) -> None:
    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    normal.leading = 14
    heading = styles["Heading2"]

    story = []
    lines = md_path.read_text(encoding="utf-8").splitlines()
    for line in lines:
        rendered = markdown_line_to_html(line)
        if not rendered:
            story.append(Spacer(1, 8))
            continue

        if line.startswith("# "):
            style = styles["Heading1"]
        elif line.startswith("## ") or line.startswith("### "):
            style = heading
        else:
            style = normal

        story.append(Paragraph(rendered, style))
        story.append(Spacer(1, 4))

    doc = SimpleDocTemplate(str(pdf_path), pagesize=LETTER, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48)
    doc.build(story)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    md_file = root / "docs" / "tutor-matching-simplified.md"
    pdf_file = root / "docs" / "tutor-matching-simplified.pdf"
    convert_markdown_to_pdf(md_file, pdf_file)
    print(f"PDF generated: {pdf_file}")
