import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Link } from '@tanstack/react-router';
import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { crmRoutes } from './crm-routes';
import type {
  CrmDataset,
  CrmDisplayRow,
  CrmField,
  CrmMode,
  CrmPayload,
  CrmValue,
  RecordFormSubmitHandler,
} from './types';
import { formatValue, getErrorMessage, readPayloadFromForm, toDatetimeInputValue } from './utils';

export const crmQueryKey = ['/records'];

export type CrmCrudPageProps = {
  dataset: CrmDataset;
};

export function CrmCrudPage({ dataset }: CrmCrudPageProps) {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [mode, setMode] = useState<CrmMode>('view');
  const [formError, setFormError] = useState<string | null>(null);

  const recordsQuery = useQuery({
    queryKey: [...crmQueryKey, dataset.id, searchText],
    queryFn: () => dataset.fetchRecords(searchText.trim()),
  });

  const rows = recordsQuery.data?.records ?? [];
  const selectedRow = useMemo(() => {
    return rows.find(row => row.id === selectedRowId) ?? rows[0] ?? null;
  }, [rows, selectedRowId]);

  const createMutation = useMutation({
    mutationFn: (payload: CrmPayload) => dataset.createRecord(payload),
    onSuccess: () => handleMutationSuccess(queryClient, setMode, setFormError),
    onError: error => setFormError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CrmPayload }) =>
      dataset.updateRecord(id, payload),
    onSuccess: () => handleMutationSuccess(queryClient, setMode, setFormError),
    onError: error => setFormError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dataset.deleteRecord(id),
    onSuccess: () => {
      setSelectedRowId(null);
      handleMutationSuccess(queryClient, setMode, setFormError);
    },
    onError: error => setFormError(getErrorMessage(error)),
  });

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const formInitialValues = mode === 'edit' ? selectedRow?.formValues : undefined;

  useEffect(() => {
    setSelectedRowId(null);
    setMode('view');
    setFormError(null);
  }, [dataset.id, searchText]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = readPayloadFromForm(new FormData(event.currentTarget), dataset.formFields);

    if (mode === 'create') {
      createMutation.mutate(payload);
      return;
    }

    if (mode === 'edit' && selectedRow) {
      updateMutation.mutate({ id: selectedRow.id, payload });
    }
  }

  function handleDelete() {
    if (!selectedRow) return;

    const confirmed = window.confirm(`Delete ${dataset.singularLabel} "${selectedRow.title}"?`);
    if (!confirmed) return;

    setFormError(null);
    deleteMutation.mutate(selectedRow.id);
  }

  return (
    <main className="page page--wide">
      <section className="toolbar toolbar--records">
        <div>
          <p className="eyebrow">Supabase data access</p>
          <h1>{dataset.label}</h1>
          <p className="toolbar-copy">{dataset.description}</p>
        </div>
        <span className="sync-state">{recordsQuery.isFetching ? 'Refreshing' : 'Synced view'}</span>
      </section>

      <section className="crm-layout" aria-label={`${dataset.label} data access`}>
        <CrmNavigation activeDatasetId={dataset.id} />

        <section className="crm-main">
          <div className="crm-heading">
            <div>
              <p className="eyebrow">{dataset.metricLabel}</p>
              <h2>{dataset.label}</h2>
              <p>{dataset.description}</p>
            </div>
            <div className="crm-actions">
              <div className="crm-stat">
                <span>{recordsQuery.data?.totalRecords ?? 0}</span>
                <p>Total records</p>
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setMode('create');
                  setFormError(null);
                }}
              >
                New {dataset.singularLabel}
              </button>
            </div>
          </div>

          {dataset.searchPlaceholder ? (
            <label className="crm-search">
              <span>Search</span>
              <input
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                placeholder={dataset.searchPlaceholder}
              />
            </label>
          ) : null}

          <div className="crm-content">
            <CrmTable
              columns={dataset.columns}
              isLoading={recordsQuery.isLoading}
              label={dataset.label}
              rows={rows}
              selectedRowId={selectedRow?.id ?? null}
              onSelect={row => {
                setSelectedRowId(row.id);
                setMode('view');
                setFormError(null);
              }}
            />

            <aside className="record-panel" aria-label="Selected record">
              {mode === 'create' || (mode === 'edit' && selectedRow) ? (
                <RecordForm
                  dataset={dataset}
                  error={formError}
                  initialValues={formInitialValues}
                  isSubmitting={isMutating}
                  mode={mode}
                  onCancel={() => {
                    setMode('view');
                    setFormError(null);
                  }}
                  onSubmit={handleSubmit}
                />
              ) : recordsQuery.isLoading ? (
                <p className="empty-state">Loading records.</p>
              ) : selectedRow ? (
                <RecordProfile
                  dataset={dataset}
                  isDeleting={deleteMutation.isPending}
                  row={selectedRow}
                  onDelete={handleDelete}
                  onEdit={() => {
                    setMode('edit');
                    setFormError(null);
                  }}
                />
              ) : (
                <p className="empty-state">Select a record to inspect it.</p>
              )}
            </aside>
          </div>

          {recordsQuery.isError ? (
            <p className="error-state">{getErrorMessage(recordsQuery.error)}</p>
          ) : null}
          {mode === 'view' && formError ? <p className="error-state">{formError}</p> : null}
        </section>
      </section>
    </main>
  );
}

type CrmNavigationProps = {
  activeDatasetId?: string;
};

export function CrmNavigation({ activeDatasetId }: CrmNavigationProps) {
  return (
    <aside className="crm-nav" aria-label="Record types">
      {crmRoutes.map(route => (
        <Link
          key={route.datasetId}
          to={route.to}
          className={route.datasetId === activeDatasetId ? 'crm-nav-item active' : 'crm-nav-item'}
          activeProps={{ className: 'crm-nav-item active' }}
        >
          <span>{route.label}</span>
        </Link>
      ))}
    </aside>
  );
}

type CrmTableProps = {
  columns: CrmDataset['columns'];
  isLoading: boolean;
  label: string;
  rows: CrmDisplayRow[];
  selectedRowId: string | null;
  onSelect: (row: CrmDisplayRow) => void;
};

function CrmTable({ columns, isLoading, label, rows, selectedRowId, onSelect }: CrmTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableColumns = useMemo<ColumnDef<CrmDisplayRow>[]>(
    () => [
      {
        id: 'record',
        accessorFn: row => row.title,
        header: label,
        cell: info => {
          const row = info.row.original;

          return (
            <button className="row-title" type="button" onClick={() => onSelect(row)}>
              <strong>{row.title}</strong>
              {row.subtitle ? <span>{row.subtitle}</span> : null}
            </button>
          );
        },
      },
      ...columns.map<ColumnDef<CrmDisplayRow>>(column => ({
        id: column.id,
        accessorFn: row => formatValue(row.fields[column.id]),
        header: column.label,
        cell: info => formatValue(info.row.original.fields[column.id]),
      })),
    ],
    [columns, label, onSelect]
  );
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="table-wrap crm-table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button
                      className="table-sort-button"
                      type="button"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      <span aria-hidden="true">
                        {{
                          asc: 'Asc',
                          desc: 'Desc',
                        }[header.column.getIsSorted() as string] ?? 'Sort'}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(tableRow => (
            <tr
              key={tableRow.id}
              className={tableRow.original.id === selectedRowId ? 'selected' : undefined}
              onClick={() => onSelect(tableRow.original)}
            >
              {tableRow.getVisibleCells().map(cell => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
          {isLoading ? (
            <tr>
              <td colSpan={table.getAllLeafColumns().length}>
                <span className="empty-state">Loading records.</span>
              </td>
            </tr>
          ) : null}
          {!isLoading && table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={table.getAllLeafColumns().length}>
                <span className="empty-state">No records found.</span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

type RecordProfileProps = {
  dataset: CrmDataset;
  isDeleting: boolean;
  row: CrmDisplayRow;
  onDelete: () => void;
  onEdit: () => void;
};

function RecordProfile({ dataset, isDeleting, row, onDelete, onEdit }: RecordProfileProps) {
  return (
    <>
      <div className="record-panel-heading">
        <div>
          <p className="eyebrow">Record profile</p>
          <h3>{row.title}</h3>
          {row.subtitle ? <p>{row.subtitle}</p> : null}
        </div>
        {row.tags?.length ? (
          <div className="tag-list">
            {row.tags.map(tag => (
              <span key={`${tag.label}-${tag.tone}`} className={`pill pill--${tag.tone}`}>
                {tag.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="record-actions">
          <button className="button button--secondary" type="button" onClick={onEdit}>
            Edit
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={isDeleting}
            onClick={onDelete}
          >
            Delete {dataset.singularLabel}
          </button>
        </div>
      </div>

      <dl className="record-details">
        {row.details.map(detail => (
          <div key={detail.label}>
            <dt>{detail.label}</dt>
            <dd>{formatValue(detail.value)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

type RecordFormProps = {
  dataset: CrmDataset;
  error: string | null;
  initialValues?: Record<string, CrmValue>;
  isSubmitting: boolean;
  mode: CrmMode;
  onCancel: () => void;
  onSubmit: RecordFormSubmitHandler;
};

function RecordForm({
  dataset,
  error,
  initialValues,
  isSubmitting,
  mode,
  onCancel,
  onSubmit,
}: RecordFormProps) {
  const [values, setValues] = useState<Record<string, CrmValue>>(() =>
    getInitialFormValues(dataset.formFields, initialValues)
  );
  const [editedGeneratedFields, setEditedGeneratedFields] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [generatingFieldName, setGeneratingFieldName] = useState<string | null>(null);
  const lastGenerationKeyRef = useRef<Record<string, string>>({});

  useEffect(() => {
    setValues(getInitialFormValues(dataset.formFields, initialValues));
    setEditedGeneratedFields(new Set());
    setGeneratingFieldName(null);
    lastGenerationKeyRef.current = {};
  }, [dataset.id, dataset.formFields, initialValues, mode]);

  useEffect(() => {
    if (mode !== 'create') return;

    const autoGeneratedField = dataset.formFields.find(field => field.autoGenerate);
    if (!autoGeneratedField?.autoGenerate) return;
    if (editedGeneratedFields.has(autoGeneratedField.name)) return;

    const sourceValues = autoGeneratedField.autoGenerate.sourceFields.reduce<
      Record<string, string>
    >((nextSourceValues, sourceField) => {
      nextSourceValues[sourceField] = String(values[sourceField] ?? '').trim();
      return nextSourceValues;
    }, {});

    if (!Object.values(sourceValues).every(Boolean)) {
      return;
    }

    const generationKey = JSON.stringify(sourceValues);
    if (lastGenerationKeyRef.current[autoGeneratedField.name] === generationKey) {
      return;
    }

    const codeValueAtRequest = values[autoGeneratedField.name];

    const timeoutId = window.setTimeout(() => {
      lastGenerationKeyRef.current[autoGeneratedField.name] = generationKey;
      setGeneratingFieldName(autoGeneratedField.name);

      autoGeneratedField.autoGenerate
        ?.generate(sourceValues)
        .then(code => {
          setValues(currentValues => {
            if (
              editedGeneratedFields.has(autoGeneratedField.name) ||
              lastGenerationKeyRef.current[autoGeneratedField.name] !== generationKey ||
              currentValues[autoGeneratedField.name] !== codeValueAtRequest
            ) {
              return currentValues;
            }

            return {
              ...currentValues,
              [autoGeneratedField.name]: code,
            };
          });
        })
        .finally(() => {
          setGeneratingFieldName(currentFieldName =>
            currentFieldName === autoGeneratedField.name ? null : currentFieldName
          );
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [dataset.formFields, editedGeneratedFields, mode, values]);

  function handleFieldChange(field: CrmField, event: ChangeEvent<HTMLInputElement>) {
    const nextValue = field.type === 'checkbox' ? event.currentTarget.checked : event.target.value;

    setValues(currentValues => ({
      ...currentValues,
      [field.name]: nextValue,
    }));

    if (field.autoGenerate) {
      setEditedGeneratedFields(currentEditedFields => new Set(currentEditedFields).add(field.name));
    }
  }

  function handleSelectChange(field: CrmField, event: ChangeEvent<HTMLSelectElement>) {
    setValues(currentValues => ({
      ...currentValues,
      [field.name]: event.target.value,
    }));
  }

  function handleTextareaChange(field: CrmField, event: ChangeEvent<HTMLTextAreaElement>) {
    setValues(currentValues => ({
      ...currentValues,
      [field.name]: event.target.value,
    }));
  }

  return (
    <form className="record-form" onSubmit={onSubmit}>
      <div className="record-panel-heading">
        <div>
          <p className="eyebrow">{mode === 'create' ? 'Create record' : 'Update record'}</p>
          <h3>
            {mode === 'create' ? `New ${dataset.singularLabel}` : `Edit ${dataset.singularLabel}`}
          </h3>
        </div>
      </div>

      <div className="record-form-fields">
        {dataset.formFields.map(field => (
          <RecordField
            key={field.name}
            field={field}
            isGenerating={generatingFieldName === field.name}
            value={values[field.name]}
            onChange={handleFieldChange}
            onSelectChange={handleSelectChange}
            onTextareaChange={handleTextareaChange}
          />
        ))}
      </div>

      {error ? <p className="error-state">{error}</p> : null}

      <div className="record-actions">
        <button type="submit" disabled={isSubmitting}>
          {mode === 'create' ? 'Create' : 'Save'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type RecordFieldProps = {
  field: CrmField;
  isGenerating: boolean;
  value: CrmValue;
  onChange: (field: CrmField, event: ChangeEvent<HTMLInputElement>) => void;
  onSelectChange: (field: CrmField, event: ChangeEvent<HTMLSelectElement>) => void;
  onTextareaChange: (field: CrmField, event: ChangeEvent<HTMLTextAreaElement>) => void;
};

function RecordField({
  field,
  isGenerating,
  value,
  onChange,
  onSelectChange,
  onTextareaChange,
}: RecordFieldProps) {
  const resolvedValue = value === null || value === undefined ? field.defaultValue : value;
  const valueAsString =
    resolvedValue === null || resolvedValue === undefined ? '' : String(resolvedValue);

  if (field.type === 'checkbox') {
    return (
      <label className="record-checkbox">
        <input
          name={field.name}
          type="checkbox"
          checked={Boolean(resolvedValue)}
          onChange={event => onChange(field, event)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="record-field">
        <span>{field.label}</span>
        <select
          name={field.name}
          value={valueAsString || field.options?.[0] || ''}
          required={field.required}
          onChange={event => onSelectChange(field, event)}
        >
          {field.options?.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="record-field">
        <span>{field.label}</span>
        <textarea
          name={field.name}
          value={valueAsString}
          required={field.required}
          onChange={event => onTextareaChange(field, event)}
        />
      </label>
    );
  }

  return (
    <label className="record-field">
      <span>{field.label}</span>
      <input
        name={field.name}
        type={field.type === 'datetime' ? 'datetime-local' : field.type}
        value={field.type === 'datetime' ? toDatetimeInputValue(valueAsString) : valueAsString}
        required={field.required}
        step={field.type === 'number' ? 'any' : undefined}
        onChange={event => onChange(field, event)}
      />
      {isGenerating ? <small className="record-field-note">Generating code...</small> : null}
    </label>
  );
}

function getInitialFormValues(fields: CrmField[], initialValues?: Record<string, CrmValue>) {
  return fields.reduce<Record<string, CrmValue>>((nextValues, field) => {
    nextValues[field.name] = initialValues?.[field.name] ?? field.defaultValue ?? '';
    return nextValues;
  }, {});
}

async function handleMutationSuccess(
  queryClient: QueryClient,
  setMode: (mode: CrmMode) => void,
  setFormError: (error: string | null) => void
) {
  await queryClient.invalidateQueries({ queryKey: crmQueryKey });
  setMode('view');
  setFormError(null);
}
