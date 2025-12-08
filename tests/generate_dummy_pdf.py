from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_dummy_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Bank of AI - Monthly Statement")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 80, "John Doe")
    c.drawString(50, height - 95, "123 AI Street, Tech City")
    c.drawString(50, height - 110, "Phone: 555-0199-8888")
    c.drawString(50, height - 125, "Email: john.doe@example.com")
    c.drawString(50, height - 140, "Account: 4000-1234-5678-9010")
    
    c.line(50, height - 150, width - 50, height - 150)
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 170, "Date")
    c.drawString(150, height - 170, "Description")
    c.drawString(450, height - 170, "Amount")
    
    c.setFont("Helvetica", 12)
    
    transactions = [
        ("2023-10-01", "UBER TRIP", "25.50"),
        ("2023-10-02", "STARBUCKS", "5.40"),
        ("2023-10-05", "WALMART GROCERY", "150.20"),
        ("2023-10-10", "NETFLIX SUBSCRIPTION", "15.99"),
        ("2023-10-15", "APPLE STORE", "999.00"),
        ("2023-10-20", "CITY UTILITIES", "85.00"),
    ]
    
    y = height - 190
    for date, desc, amount in transactions:
        c.drawString(50, y, date)
        c.drawString(150, y, desc)
        c.drawString(450, y, amount)
        y -= 20
        
    c.save()

if __name__ == "__main__":
    create_dummy_pdf("tests/dummy_statement.pdf")
    print("Created tests/dummy_statement.pdf")
