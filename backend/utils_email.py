import os
from mailjet_rest import Client

MAILJET_API_KEY = os.environ.get("MAILJET_API_KEY")
MAILJET_SECRET_KEY = os.environ.get("MAILJET_SECRET_KEY")
MAILJET_SENDER = os.environ.get("MAILJET_SENDER")   # e.g. noreply@yourdomain.com

def send_email(to_email: str, subject: str, body_html: str):

    if not MAILJET_API_KEY or not MAILJET_SECRET_KEY or not MAILJET_SENDER:
        print("❌ Mailjet settings missing — email not sent.")
        return False

    try:
        mailjet = Client(auth=(MAILJET_API_KEY, MAILJET_SECRET_KEY), version='v3.1')

        data = {
            'Messages': [
                {
                    "From": {
                        "Email": MAILJET_SENDER,
                        "Name": "Research Submission System"
                    },
                    "To": [
                        {"Email": to_email}
                    ],
                    "Subject": subject,
                    "HTMLPart": body_html
                }
            ]
        }

        result = mailjet.send.create(data=data)

        if result.status_code in (200, 201):
            print(f"📨 Email sent to {to_email}")
            return True
        else:
            print("❌ Mailjet Error:", result.json())
            return False

    except Exception as e:
        print("❌ Failed sending email:", e)
        return False
