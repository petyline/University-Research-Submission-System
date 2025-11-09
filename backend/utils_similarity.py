from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def compute_similarity_percent(new_text: str, existing_texts: list):
    if not existing_texts:
        return 0.0
    corpus = existing_texts + [new_text]
    vectorizer = TfidfVectorizer(stop_words='english', max_features=5000)
    vectors = vectorizer.fit_transform(corpus)
    sims = cosine_similarity(vectors[-1], vectors[:-1])[0]
    max_sim = float(sims.max()) if len(sims) > 0 else 0.0
    return round(max_sim * 100, 2)
