import pytest
from rest_framework.test import APIClient
from users.models import User
from projects.models import Project, Membership, Task


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email='meera@taskboard.dev', name='Meera Iyer', password='password123')


@pytest.fixture
def auth_client(client, user):
    response = client.post('/api/auth/login', {
        'email': 'meera@taskboard.dev',
        'password': 'password123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")
    return client


@pytest.mark.django_db
class TestProjects:
    def test_create_project(self, auth_client, user):
        response = auth_client.post('/api/projects', {'name': 'My Project'}, format='json')
        assert response.status_code == 201
        assert response.data['project']['name'] == 'My Project'

    def test_list_only_returns_member_projects(self, auth_client, user):
        p1 = Project.objects.create(name='Mine', owner=user)
        Membership.objects.create(user=user, project=p1, role='admin')
        other = User.objects.create_user(email='other@example.com', name='Other', password='password123')
        p2 = Project.objects.create(name='Not Mine', owner=other)
        Membership.objects.create(user=other, project=p2, role='admin')

        response = auth_client.get('/api/projects')
        assert response.status_code == 200
        names = [p['name'] for p in response.data['projects']]
        assert 'Mine' in names
        assert 'Not Mine' not in names

    def test_get_project_detail(self, auth_client, user):
        project = Project.objects.create(name='My Project', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.get(f'/api/projects/{project.id}')
        assert response.status_code == 200
        assert response.data['project']['name'] == 'My Project'

    def test_non_member_cannot_view_project(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='Private', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.get(f'/api/projects/{project.id}')
        assert response.status_code == 403


@pytest.mark.django_db
class TestTasks:
    def test_create_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        response = auth_client.post(f'/api/projects/{project.id}/tasks', {'title': 'Do a thing'}, format='json')
        assert response.status_code == 201
        assert response.data['task']['title'] == 'Do a thing'

    def test_viewers_cannot_create_tasks(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/projects/{project.id}/tasks', {'title': 'A task'}, format='json')
        assert response.status_code == 403

    def test_delete_task_requires_membership(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.delete(f'/api/tasks/{task.id}')
        assert response.status_code == 403

    def test_non_member_cannot_patch_task(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.patch(f'/api/tasks/{task.id}', {'title': 'Hacked'}, format='json')
        assert response.status_code == 403
        task.refresh_from_db()
        assert task.title == 'A task'

    def test_viewer_cannot_patch_task(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.patch(f'/api/tasks/{task.id}', {'title': 'Viewer edit'}, format='json')
        assert response.status_code == 403

    def test_member_can_patch_task(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='member')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        response = auth_client.patch(f'/api/tasks/{task.id}', {'title': 'Updated'}, format='json')
        assert response.status_code == 200
        assert response.data['task']['title'] == 'Updated'

    def test_search_uses_orm_and_rejects_injection_as_literal(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='Safe task', created_by=user)
        Task.objects.create(project=project, title='Other', created_by=user)

        response = auth_client.get(f'/api/projects/{project.id}/tasks', {'q': "Safe%' OR 1=1--"})
        assert response.status_code == 200
        titles = [t['title'] for t in response.data['tasks']]
        assert titles == []  # treated as literal search, not SQL
        assert 'assignee' in response.data['tasks'] or True  # shape check below on hit

        hit = auth_client.get(f'/api/projects/{project.id}/tasks', {'q': 'Safe'})
        assert hit.status_code == 200
        assert len(hit.data['tasks']) == 1
        assert hit.data['tasks'][0]['title'] == 'Safe task'
        assert 'assignee' in hit.data['tasks'][0]

    def test_patch_rejects_empty_title(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        response = auth_client.patch(f'/api/tasks/{task.id}', {'title': '   '}, format='json')
        assert response.status_code == 400

    def test_assignee_must_be_project_member(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        outsider = User.objects.create_user(email='out@example.com', name='Out', password='password123')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        response = auth_client.patch(
            f'/api/tasks/{task.id}',
            {'assigneeId': str(outsider.id)},
            format='json',
        )
        assert response.status_code == 400
        task.refresh_from_db()
        assert task.assignee_id is None

    def test_assignee_change_emits_activity(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        response = auth_client.patch(
            f'/api/tasks/{task.id}',
            {'assigneeId': str(user.id)},
            format='json',
        )
        assert response.status_code == 200
        feed = auth_client.get(f'/api/projects/{project.id}/activity')
        assert feed.data['activities'][0]['action'] == 'task.assignee_changed'


@pytest.mark.django_db
class TestComments:
    def test_member_can_post_and_list_chronologically(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='member')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        r1 = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': 'first'}, format='json')
        r2 = auth_client.post(f'/api/tasks/{task.id}/comments', {'body': 'second'}, format='json')
        assert r1.status_code == 201
        assert r2.status_code == 201

        listed = auth_client.get(f'/api/tasks/{task.id}/comments')
        assert listed.status_code == 200
        bodies = [c['body'] for c in listed.data['comments']]
        assert bodies == ['first', 'second']
        assert listed.data['comments'][0]['author']['email'] == 'meera@taskboard.dev'
        assert 'createdAt' in listed.data['comments'][0]

    def test_viewer_can_read_but_not_post(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')
        task = Task.objects.create(project=project, title='A task', created_by=owner)
        from projects.models import Comment
        Comment.objects.create(task=task, author=owner, body='hello')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        listed = client.get(f'/api/tasks/{task.id}/comments')
        assert listed.status_code == 200
        assert len(listed.data['comments']) == 1

        posted = client.post(f'/api/tasks/{task.id}/comments', {'body': 'nope'}, format='json')
        assert posted.status_code == 403

    def test_non_member_cannot_list_comments(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=owner)

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        listed = client.get(f'/api/tasks/{task.id}/comments')
        assert listed.status_code == 403


@pytest.mark.django_db
class TestActivity:
    def test_task_create_and_status_emit_activity(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')

        created = auth_client.post(f'/api/projects/{project.id}/tasks', {'title': 'Ship it'}, format='json')
        task_id = created.data['task']['id']
        auth_client.patch(f'/api/tasks/{task_id}', {'status': 'in_progress'}, format='json')

        feed = auth_client.get(f'/api/projects/{project.id}/activity')
        assert feed.status_code == 200
        actions = [a['action'] for a in feed.data['activities']]
        assert actions[0] == 'task.status_changed'
        assert 'task.created' in actions

    def test_comment_emits_activity(self, auth_client, user):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', created_by=user)

        auth_client.post(f'/api/tasks/{task.id}/comments', {'body': 'note'}, format='json')
        feed = auth_client.get(f'/api/projects/{project.id}/activity')
        assert feed.data['activities'][0]['action'] == 'comment.added'

    def test_non_member_cannot_read_activity(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        feed = client.get(f'/api/projects/{project.id}/activity')
        assert feed.status_code == 403

    def test_activity_failure_rolls_back_task_change(self, auth_client, user, monkeypatch):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='A task', status='todo', created_by=user)

        from projects import views as project_views

        def boom(**kwargs):
            raise RuntimeError('activity write failed')

        monkeypatch.setattr(project_views, '_record_activity', boom)

        with pytest.raises(RuntimeError, match='activity write failed'):
            auth_client.patch(f'/api/tasks/{task.id}', {'status': 'done'}, format='json')
        task.refresh_from_db()
        assert task.status == 'todo'


@pytest.mark.django_db
class TestExport:
    def test_viewer_cannot_export(self, client, user):
        owner = User.objects.create_user(email='owner@example.com', name='Owner', password='password123')
        project = Project.objects.create(name='P', owner=owner)
        Membership.objects.create(user=owner, project=project, role='admin')
        Membership.objects.create(user=user, project=project, role='viewer')

        resp = client.post('/api/auth/login', {'email': 'meera@taskboard.dev', 'password': 'password123'}, format='json')
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['token']}")

        response = client.post(f'/api/projects/{project.id}/export')
        assert response.status_code == 403

    def test_export_missing_credentials_returns_502(self, auth_client, user, monkeypatch):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        Task.objects.create(project=project, title='One', created_by=user)

        monkeypatch.delenv('AIRTABLE_API_KEY', raising=False)
        monkeypatch.delenv('AIRTABLE_BASE_ID', raising=False)

        response = auth_client.post(f'/api/projects/{project.id}/export')
        assert response.status_code == 502
        assert 'AIRTABLE' in response.data['error']

    def test_export_upserts_and_isolates_failures(self, auth_client, user, monkeypatch):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        t1 = Task.objects.create(project=project, title='One', created_by=user)
        t2 = Task.objects.create(project=project, title='Two', created_by=user)

        from projects.airtable_mock import MockAirtableTable
        from projects import airtable_client

        table = MockAirtableTable(fail_task_ids={str(t2.id)})
        monkeypatch.setattr(airtable_client, 'get_table', lambda: table)
        monkeypatch.setattr(airtable_client.time, 'sleep', lambda *_: None)

        first = auth_client.post(f'/api/projects/{project.id}/export')
        assert first.status_code == 200
        assert first.data['created'] == 1
        assert first.data['failed'] == 1
        assert str(t1.id) in table.records
        assert str(t2.id) not in table.records

        # second run updates existing record instead of duplicating
        table.fail_task_ids.clear()
        t1.title = 'One updated'
        t1.save()
        second = auth_client.post(f'/api/projects/{project.id}/export')
        assert second.status_code == 200
        assert second.data['updated'] >= 1
        assert second.data['created'] >= 1
        assert table.records[str(t1.id)]['Title'] == 'One updated'
        assert len(table.records) == 2

    def test_transient_retry_then_succeeds(self, auth_client, user, monkeypatch):
        project = Project.objects.create(name='P', owner=user)
        Membership.objects.create(user=user, project=project, role='admin')
        task = Task.objects.create(project=project, title='Retry me', created_by=user)

        from projects.airtable_mock import MockAirtableTable
        from projects import airtable_client

        table = MockAirtableTable(transient_then_ok_ids={str(task.id)})
        monkeypatch.setattr(airtable_client, 'get_table', lambda: table)
        monkeypatch.setattr(airtable_client.time, 'sleep', lambda *_: None)

        response = auth_client.post(f'/api/projects/{project.id}/export')
        assert response.status_code == 200
        assert response.data['exported'] == 1
        assert response.data['failed'] == 0
        assert table.create_calls == 1

