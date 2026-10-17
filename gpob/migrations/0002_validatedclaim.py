from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('media', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ValidatedClaim',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('claim_id', models.CharField(max_length=40, unique=True)),
                ('text', models.TextField()),
                ('language', models.CharField(default='English', max_length=40)),
                ('topic', models.CharField(blank=True, default='', max_length=80)),
                ('authority', models.CharField(max_length=255)),
                ('corroborators', models.CharField(blank=True, default='', max_length=400)),
                ('source_url', models.URLField(blank=True, default='', max_length=1000)),
                ('verdict', models.CharField(default='Supported', max_length=40)),
                ('evidence', models.TextField(blank=True, default='')),
                ('verified_by', models.CharField(blank=True, default='', max_length=120)),
                ('verified_at', models.DateField()),
                ('match_count', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-verified_at', '-id'],
            },
        ),
    ]
