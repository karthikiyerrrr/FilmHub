import json
import os
from google.cloud import storage


def get_gcs_client() -> storage.Client:
    """Create a GCS client using service account JSON from environment."""
    sa_json = os.environ.get("GCS_SERVICE_ACCOUNT_JSON", "")
    if sa_json:
        from google.oauth2 import service_account
        info = json.loads(sa_json)
        credentials = service_account.Credentials.from_service_account_info(info)
        return storage.Client(credentials=credentials, project=info.get("project_id"))
    return storage.Client()
