from django.urls import path

from . import views

urlpatterns = [
    path('overview/', views.OverviewView.as_view()),
    path('countries/', views.CountryListView.as_view()),
    path('publishers/', views.PublisherListView.as_view()),
    path('keywords/', views.KeywordListView.as_view()),
    path('keywords/<int:pk>/', views.KeywordDetailView.as_view()),
    path('facebook-pages/', views.FacebookPageListView.as_view()),
    path('facebook-pages/<int:pk>/', views.FacebookPageDetailView.as_view()),
    path('news/', views.NewsListView.as_view()),
    path('news/<int:pk>/', views.NewsDetailView.as_view()),
    path('statistics/', views.StatisticsView.as_view()),
    path('statistics/<int:country_id>/', views.StatisticsView.as_view()),
    path('fetch/', views.FetchJobListView.as_view()),
    path('fetch/<int:pk>/', views.FetchJobDetailView.as_view()),
    path('export/', views.ExportWordView.as_view()),
]
